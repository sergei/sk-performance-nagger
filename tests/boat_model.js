function radians(degrees) {
    return degrees * (Math.PI/180);
}

function degrees(radians) {
    return radians / (Math.PI/180);
}

// Standard Normal variate using Box-Muller transform.
function randn_bm() {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); //Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
}

class BoatModel{
    constructor(twd=0, tws=10, cog=30, sog=5,
                delta_sog =0, delta_twa =0,
                speed_rms=0.5, angle_rms=1) {
        this.t = [0]
        this.twd = [twd]
        this.tws = [tws]
        this.cog = [cog]
        this.sog = [sog]
        this.delta_sog = [delta_sog]
        this.delta_twa = [delta_twa]
        this.speed_rms = speed_rms
        this.angle_rms = angle_rms
    }

    update(t, options){
        if (options === undefined) options = {};
        const twd = options.twd ? options.twd  : this.twd[this.twd-1]
        const tws = options.tws ? options.tws  : this.tws[this.tws-1]
        const cog = options.cog ? options.cog  : this.cog[this.cog-1]
        const sog = options.sog ? options.sog  : this.sog[this.sog-1]

        this.t.push(t)
        this.twd.push(twd)
        this.tws.push(tws)
        this.cog.push(cog)
        this.sog.push(sog)
    }

    get_epochs(start_utc, start_loc, num, dt=1){
        const epochs = []

        let idx = 0
        let t = 0
        let twd = this.twd[0]
        let tws = this.tws[0]
        let cog = this.cog[0]
        let sog = this.sog[0]
        let delta_sog = this.delta_sog[0]
        let delta_twa = this.delta_twa[0]
        let loc = Object.assign({}, start_loc)
        let mag_decl = 13

        for(let i =0; i< num; i++) {
            if(idx < this.t.length && t >= this.t[idx]){
                twd = this.twd[idx]
                tws = this.tws[idx]
                cog = this.cog[idx]
                sog = this.sog[idx]
                idx ++
            }

            let utc = start_utc + t
            let hdg = cog - mag_decl
            let twa = (twd - hdg) % 360
            twa = twa > 180 ? twa - 360: twa
            let cos_twa = Math.cos(radians(twa))
            let aws = Math.sqrt(sog * sog + tws * tws + 2 * sog * tws * cos_twa)
            let awa = degrees(Math.acos((tws * cos_twa + sog) / aws))
            awa = twa > 0 ? awa  :  -awa
            let vmg = sog * Math.cos(radians(twa))

            epochs.push({
                utc: utc,
                pos: loc,
                hdg: radians(this.noisy_dir(hdg)),
                vmg: this.noisy_speed(vmg),
                twa: radians(this.noisy_angle(twa)),
                sow: this.noisy_speed(sog),
                target_twa: radians(twa + delta_twa),
                target_sow: sog + delta_sog
            })

            t += dt
            const dist_deg = (sog /60) * (dt / 3600.)
            loc.latitude += dist_deg * Math.cos(radians(cog))
            loc.longitude += dist_deg * Math.sin(radians(cog)) * Math.cos(radians(loc.latitude))
        }

        return epochs
    }

    noisy_angle(angle) {
        angle += randn_bm() *  this.angle_rms
        if (angle > 180)
            return angle - 360
        else if (angle < -180)
            return angle + 360
        else
            return angle
    }

    noisy_dir (direction) {
        direction += randn_bm() *  this.angle_rms
        return direction % 360.
    }

    noisy_speed(self, speed) {
        return Math.abs(speed + randn_bm() *  this.speed_rms)
    }

}

module.exports = BoatModel
