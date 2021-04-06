const SlidingWindow = require('./sliding_window')

// Map SignalK paths to the epoch object
const PATH_MAP = {
    'navigation.datetime' : 'utc',
    'navigation.position' : 'pos',
    'navigation.headingMagnetic' : 'hdg',
    'performance.velocityMadeGood' : 'vmg',
    'environment.wind.angleTrueWater' : 'twa',
    'navigation.speedThroughWater' : 'sow',
    'performance.targetSpeed': 'target_sow',
    'performance.targetAngle': 'target_twa',
};

class Deque {
    constructor(maxlen) {
        this.maxlen = maxlen
        this.q = []
    }
    append(v){
        if(this.q.length >= this.maxlen){
            this.q.shift()
        }
        this.q.push(v)
    }
    clear(){
        this.q = []
    }
}

const METERS_IN_NM = 1852.

const DEG2RAD = Math.PI / 180;
const BEAT_THR = 70 * DEG2RAD;
const RUN_THR = 110 * DEG2RAD;

const SB_MIN_THR = 5 * DEG2RAD;
const SB_MAX_THR = 175 * DEG2RAD;

const SOG_THR = 2. * (3600 / 1852.)  // If average SOG is below this threshold we throw the data out

const WIN_LEN = 60  // Length of the sliding window
const HALF_WIN = WIN_LEN / 2

const TURN_THR1 = WIN_LEN / 10  // Threshold to detect roundings and tacks
const TURN_THR2 = WIN_LEN / 4   // Threshold to detect roundings and tacks

const STRAIGHT_THR = WIN_LEN - TURN_THR1

const WIND_SHIFT_THR = 10

class NavStats{
    constructor(error, debug, cb){
        this.error = error
        this.debug = debug
        this.cb = cb
        this.maxAllowableDataAgeMs = 10000;
        this.winLen = WIN_LEN;
        this.epoch = {
            utc: null,
            pos: null,
            hdg: null,
            vmg: null,
            twa: null,
            sow: null,
            target_twa: null,
            target_sow: null,
        }
        
        // Queues to analyze the turns
        this.turns_utc = new Deque(this.winLen)
        this.turns_loc = new Deque(this.winLen)
        this.turns_sog = new SlidingWindow(this.winLen)
        this.turns_up_down = new SlidingWindow(this.winLen)  // 1 - upwind, -1 - downwind, 0 - reach
        this.turns_sb_pr = new SlidingWindow(this.winLen)    // 1 - starboard, -1 - port, 0 - head to wind or ddw

        // Queues to analyze stats
        this.stats_utc = new Deque(this.winLen)
        this.stats_loc = new Deque(this.winLen)

        // Wind shift analysis
        this.ref_twd = null
        this.stats_twd = new SlidingWindow(this.winLen)
        this.stats_twa = new SlidingWindow(this.winLen)
        this.stats_hdg = new SlidingWindow(this.winLen)

        // Target performance analysis
        this.stats_vmg_diff = new SlidingWindow(this.winLen)
        this.stats_speed_diff = new SlidingWindow(this.winLen)
        this.stats_point_diff = new SlidingWindow(this.winLen)
    }

    reset() {
        this.turns_sog.clear()
        this.turns_up_down.clear()
        this.turns_sb_pr.clear()
        this.turns_utc.clear()
        this.turns_loc.clear()
        
        // The instruments usually are not calibrated so we reset all stats information after every turn
        this.ref_twd = null
        this.clear_stats_queues()
    }

    clear_stats_queues() {
        this.stats_utc.clear()
        this.stats_loc.clear()
        this.stats_twd.clear()
        this.stats_twa.clear()
        this.stats_hdg.clear()
        this.stats_vmg_diff.clear()
        this.stats_speed_diff.clear()
        this.stats_point_diff.clear()
    }

    // The deltas were assembled to the epoch, let's do computations
    processEpoch(epoch) {
        const twa = epoch.twa.v
        const sog = epoch.sow.v
        const hdg = epoch.hdg.v
        const utc = epoch.utc.v
        const vmg_diff = epoch.vmg - epoch.target_sow * Math.cos(epoch.target_twa)
        const stats_speed_diff = epoch.sow - epoch.target_sow
        const stats_point_diff = Math.abs(epoch.twa) - Math.abs(epoch.target_twa)

        let up_down = 0
        if (Math.abs(twa) < BEAT_THR)
            up_down =  1
        else if (Math.abs(twa) > RUN_THR)
            up_down = -1

        let sb_pr = 0;
        if(twa > SB_MIN_THR && twa < SB_MAX_THR)
            sb_pr = 1
        else if (twa < -SB_MIN_THR && twa > -SB_MAX_THR)
            sb_pr = -1

        const twd = twa + hdg
        
        // Update the queues
        this.turns_utc.append(utc)
        this.turns_loc.append(epoch.pos)
        this.turns_sog.append(sog)
        this.turns_up_down.append(up_down)
        this.turns_sb_pr.append(sb_pr)

        this.stats_utc.append(utc)
        this.stats_loc.append(epoch.pos)
        this.stats_twd.append(twd)
        this.stats_twa.append(twa)
        this.stats_hdg.append(hdg)

        this.stats_vmg_diff.append(vmg_diff)
        this.stats_speed_diff.append(stats_speed_diff)
        this.stats_point_diff.append(stats_point_diff)

        // Analyse the queues

        if (this.turns_sog.len() < this.winLen) {
            return
        }

        if (this.turns_sog.get_avg() < SOG_THR) {
            this.reset()
            return
        }

        // Suspected rounding either top or bottom mark
        if (Math.abs(this.turns_up_down.get_sum()) < TURN_THR1) {
            // Do more costly verification
            const [sum_before, sum_after] = this.turns_up_down.sum_halves()
            if (Math.abs(sum_before) > TURN_THR1 && Math.abs(sum_after) > TURN_THR2) {
                const utc = this.turns_utc[HALF_WIN]
                const loc = this.turns_loc[HALF_WIN]
                const is_windward = sum_after < 0
                this.cb(is_windward ? 'windward-mark' : 'leeward-mark', utc, loc)
                this.reset()
            }
        }

        // Suspected tacking or gybing
        if (Math.abs(this.turns_sb_pr.get_sum()) < TURN_THR1) {
            const [sum_before, sum_after] = this.turns_sb_pr.sum_halves()
            if( Math.abs(sum_before) > TURN_THR1 && Math.abs(sum_after) > TURN_THR2) {
                const tack_idx = HALF_WIN
                const utc = this.turns_utc[tack_idx]
                const loc = this.turns_loc[tack_idx]
                const is_tack = Math.abs(twa) < 90 * DEG2RAD
                const distance_loss_m = this.compute_tack_efficiency(tack_idx)
                this.cb(is_tack? 'tack' : 'gybe', utc, loc, distance_loss_m)
                this.reset()
            }
        }
    }

    compute_tack_efficiency(tack_idx){
        const before_tack_idx = tack_idx - TURN_THR1
        const [sum_before, sum_after] = this.turns_sog.sum_halves(before_tack_idx)
        const avg_sog_before = sum_before / before_tack_idx
        const avg_sog_after = sum_after / (this.turns_sog.len() - before_tack_idx)

        const duration_sec = this.turns_sog.len()
        return (avg_sog_before - avg_sog_after) * METERS_IN_NM / 3600. * duration_sec
    }


    // Receive deltas from the server try to
    processDelta(u){
        const values = u.values;
        const timeStamp = new Date(u.timestamp)
        let validPositionReceived = false;
        values.forEach( v => {
            this.epoch[PATH_MAP[v.path]] = {
                v: v.value,
                t: timeStamp
            }
            if (!validPositionReceived)
                validPositionReceived = v.path === 'navigation.position' && v.value.latitude !== undefined
        })

        if ( validPositionReceived ) {
            let maxAge = -1;
            // Make sure that *all* values are up to date
            Object.entries(this.epoch).forEach( (x,v) => {
                const age = x[1] !== null ? timeStamp - x[1].t : 3600000
                maxAge = Math.max(maxAge, age)
            })

            if (maxAge < this.maxAllowableDataAgeMs) {
                this.processEpoch(this.epoch);
            }
        }
    }
}

module.exports = {NavStats, PATH_MAP}
