
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

class SlidingWindow {
    constructor(maxlen) {
        this.maxlen = maxlen
        this.q = []
        this.sum = 0
    }
    clear(){
        this.q = []
        this.sum = 0
    }
    append(v){
        let old_v;
        if(this.q.length < this.maxlen){
            old_v = 0
        }else{
            old_v = this.q.shift()
        }
        this.sum -= old_v
        this.q.push(v)
        this.sum += v
    }

    len(){
        return this.q.length
    }
    get_avg(){
        return this.sum / this.q.length
    }
    get_sum(){
        return this.sum / this.q.length
    }
    sum_halves(splitPoint=null){
        splitPoint = splitPoint === null ? this.maxlen / 2 : splitPoint
        const sumBefore = this.q.slice(0, splitPoint).reduce((a, b) => a + b, 0)
        const sumAfter = this.q.slice(splitPoint-1).reduce((a, b) => a + b, 0)
        return [sumBefore, sumAfter]
    }
    isFull(){
        return  this.q.length === this.maxlen
    }
}

class NavStats{
    constructor(error, debug, cb){
        this.error = error
        this.debug = debug
        this.cb = cb
        this.maxAllowableDataAgeMs = 10000;
        this.winLen = 60;
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
            validPositionReceived = v.path === 'navigation.position' && v.value.latitude !== undefined
        })

        if ( validPositionReceived ) {
            let maxAge = -1;
            // Make sure that *all* values are up to date
            Object.entries(this.epoch).forEach( (x,v) => {
                const age = x[1] !== null ? timeStamp - x[1].t : 3600000
                maxAge = Math.max(maxAge, age)
                this.debug(x[0])
                this.debug(x[1])
                this.debug(age)
            })

            if (maxAge < this.maxAllowableDataAgeMs) {
                this.processEpoch(this.epoch);
            }
        }
    }
}

module.exports = {NavStats, PATH_MAP}
