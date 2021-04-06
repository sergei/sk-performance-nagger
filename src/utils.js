function radians(degrees) {
    return degrees * (Math.PI/180);
}

function degrees(radians) {
    return radians / (Math.PI/180);
}

function mps(knots){
    return knots * (3600 / 1852.)
}

module.exports = { radians, degrees, mps };
