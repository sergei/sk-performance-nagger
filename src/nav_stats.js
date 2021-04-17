const SlidingWindow = require('./sliding_window')
const SlidingWindowAngle = require("./sliding_window_angle");
const { degrees } = require('./utils')
const { knots } = require('./utils')

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
const PI2 = Math.PI * 2;
const PI_BY_2 = Math.PI / 2;

const BEAT_THR = 70 * DEG2RAD;
const RUN_THR = 110 * DEG2RAD;

const SB_MIN_THR = 5 * DEG2RAD;
const SB_MAX_THR = 175 * DEG2RAD;

const SOG_THR = 2. * (1852. / 3600)  // If average SOG is below this threshold we throw the data out

const WIN_LEN = 60  // Length of the sliding window
const HALF_WIN = WIN_LEN / 2

const TURN_THR1 = WIN_LEN / 10  // Threshold to detect roundings and tacks
const TURN_THR2 = WIN_LEN / 4   // Threshold to detect roundings and tacks

const STRAIGHT_THR = WIN_LEN - TURN_THR1

const WIND_SHIFT_THR = 10 * DEG2RAD


function angle_u(angle) {
    return (angle + PI2 ) % PI2;
}


function angle_s(angle) {
    if( angle > Math.PI )
        return angle - PI2
    else
        return angle
}


class NavStats{
    constructor(error, debug, cb){
        this.error = error
        this.debug = debug
        this.cb = cb
        this.maxAllowableDataAgeMs = 10000;
        this.winLen = WIN_LEN;
        this.epoch = {
            utc: undefined,
            pos: undefined,
            hdg: undefined,
            vmg: undefined,
            twa: undefined,
            sow: undefined,
            target_twa: undefined,
            target_sow: undefined,
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
        this.ref_twd = undefined
        this.stats_twd = new SlidingWindowAngle(this.winLen)
        this.stats_twa = new SlidingWindowAngle(this.winLen)

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
        this.ref_twd = undefined
        this.clear_stats_queues()
    }

    clear_stats_queues() {
        this.stats_utc.clear()
        this.stats_loc.clear()
        this.stats_twd.clear()
        this.stats_twa.clear()
        this.stats_vmg_diff.clear()
        this.stats_speed_diff.clear()
        this.stats_point_diff.clear()
    }

    // The deltas were assembled to the epoch, let's do computations
    processEpoch(epoch) {
        this.debug('processEpoch')

        const twa = epoch.twa.v
        const sog = epoch.sow.v
        const hdg = epoch.hdg.v
        const utc = epoch.utc.v
        const vmg_diff = epoch.vmg.v - epoch.target_sow.v * Math.cos(epoch.target_twa.v)
        const stats_speed_diff = epoch.sow.v - epoch.target_sow.v
        const stats_point_diff = Math.abs(epoch.twa.v) - Math.abs(epoch.target_twa.v)

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
        const last_pos = epoch.pos.v;

        // Update the queues
        this.turns_utc.append(utc)
        this.turns_loc.append(last_pos)
        this.turns_sog.append(sog)
        this.turns_up_down.append(up_down)
        this.turns_sb_pr.append(sb_pr)

        this.stats_utc.append(utc)
        this.stats_loc.append(last_pos)
        this.stats_twd.append(twd)
        this.stats_twa.append(twa)

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
                const event_utc = this.turns_utc[HALF_WIN]
                const loc = this.turns_loc[HALF_WIN]
                const is_windward = sum_after < 0
                this.cb(is_windward ? 'windward-mark' : 'leeward-mark', utc, {utc:event_utc, pos: loc})
                this.reset()
            }
        }

        // Suspected tacking or gybing
        if (Math.abs(this.turns_sb_pr.get_sum()) < TURN_THR1) {
            const [sum_before, sum_after] = this.turns_sb_pr.sum_halves()
            if( Math.abs(sum_before) > TURN_THR1 && Math.abs(sum_after) > TURN_THR2) {
                const tack_idx = HALF_WIN
                const event_utc = this.turns_utc[tack_idx]
                const loc = this.turns_loc[tack_idx]
                const is_tack = Math.abs(twa) < PI_BY_2
                const distance_loss = this.compute_tack_efficiency(tack_idx)

                const tackOrGybe = is_tack ? 'tack' : 'gybe'
                const lostOrGained = distance_loss > 0 ? 'lost' : 'gained'
                const message = `You ${lostOrGained} ${Math.abs(distance_loss).toFixed(0)} meters on this ${tackOrGybe}`

                this.cb(is_tack? 'tack' : 'gybe', utc, {
                    state: 'alert',
                    method: [ "visual", "sound" ],
                    message: message,
                    utc:event_utc, pos:loc, distance_loss: distance_loss
                })
                this.reset()
            }
        }

        // Compute performance stats and evaluate wind shifts only if we are sailing without any maneuvers
        // This allows us to to ease the requirements on instrument calibration
        if ( Math.abs(this.turns_up_down.get_sum()) > STRAIGHT_THR
            && Math.abs(this.turns_sb_pr.get_sum()) > STRAIGHT_THR
            && this.stats_twd.isFull() )
        {
            // Check for wind shift
            const avg_twd = angle_u(this.stats_twd.get_avg())  // 0; 2*pi
            const avg_twa = angle_s(this.stats_twa.get_avg())  // -pi; +pi
            if (this.ref_twd === undefined )
                this.ref_twd = avg_twd

            const wind_shift = angle_s(avg_twd - this.ref_twd)  // -pi; pi
            const is_lift = (wind_shift * avg_twa) > 0

            if (Math.abs(wind_shift) > WIND_SHIFT_THR) {
                const liftedOrHeaded = is_lift ? 'lifted' : 'headed'
                const veeredOrBacked = wind_shift >0 ? 'veered' : 'backed'
                const message = `Wind ${veeredOrBacked} by ${degrees(Math.abs(wind_shift))} degrees. You got ${liftedOrHeaded}`

                this.cb(is_lift ? 'lift' : 'header', utc, {
                    state: 'alert',
                    method: [ "visual", "sound" ],
                    message: message,
                    pos: last_pos, shift: wind_shift
                })
                this.ref_twd = avg_twd
            }

            // Compute target stats
            if (this.stats_vmg_diff.isFull() ) {
                const duration_sec = this.stats_vmg_diff.len()
                const speed_delta = this.stats_speed_diff.get_avg()

                let distance_delta = this.stats_vmg_diff.get_avg()  * duration_sec
                const is_downwind = this.turns_up_down.get_sum() < 0
                if( is_downwind )
                    distance_delta = - distance_delta

                const twa_angle_delta = this.stats_point_diff.get_avg()
                const gainedOrLost = distance_delta >= 0 ? 'gained' : 'lost'
                const fasterOrSlower = speed_delta < 0 ? 'slower' : 'faster'
                const higherOrLower = twa_angle_delta < 0 ? 'higher' : 'lower'
                const message =
                  `You ${gainedOrLost} ${Math.abs(distance_delta).toFixed(0)} meters to the target boat. `
                  + `You were ${knots(Math.abs(speed_delta)).toFixed(1)} knots ${fasterOrSlower} than target. `
                  + `You were sailing ${degrees(Math.abs(twa_angle_delta)).toFixed(0)} degrees ${higherOrLower} than target.`

                this.cb('target-stats', utc, {
                    state: 'alert',
                    method: [ "visual", "sound" ],
                    message: message,
                    pos: last_pos,
                    distance_delta: distance_delta, speed_delta: speed_delta, twa_angle_delta: twa_angle_delta
                })
            }

            // Start new window
            this.clear_stats_queues()
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
            Object.entries(this.epoch).forEach( (x) => {
                const age = x[1] !== undefined ? timeStamp - x[1].t : 3600000
                maxAge = Math.max(maxAge, age)
            })

            if (true) {
            // if (maxAge < this.maxAllowableDataAgeMs) {
                this.processEpoch(this.epoch);
            }
        }
    }
}

module.exports = {NavStats, PATH_MAP}
