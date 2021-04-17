function radians(degrees) {
    return degrees * (Math.PI/180);
}

function degrees(radians) {
    return radians / (Math.PI/180);
}

function mps(knots){
    return knots * (  1852./ 3600)
}

function knots(mps){
    return mps / (  1852./ 3600)
}

module.exports = { radians, degrees, mps, knots};
