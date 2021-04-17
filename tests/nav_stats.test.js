const BoatModel = require("./boat_model");
const utils = require("../src/utils");
const {NavStats} = require("../src/nav_stats");

function getStats(boatModel, len) {
    const onNotification = jest.fn()
    const navStats = new NavStats(console.log, console.log, onNotification);

    boatModel.getDeltas(len).forEach(delta => {
        navStats.processDelta(delta)
    })
    return onNotification;
}

test('Ignore short intervals', () => {
    const boatModel = new BoatModel(0, 10, -30, 5, 0, 0, 0.5,1)

    const onNotification = getStats(boatModel, 30);

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(0)
});

test('Windward rounding', () => {
    const boatModel = new BoatModel(0, 10, -30, 5, 0, 0, 0.5,1)
    boatModel.update(30, {cog:-150})

    const onNotification = getStats(boatModel, 90);

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(1)
    expect(onNotification.mock.calls[0][0]).toBe('windward-mark')
});

test('Leeward rounding', () => {
    const boatModel = new BoatModel(0, 10, -150, 5, 0, 0, 0.5,1)
    boatModel.update(30, {cog:30})

    const onNotification = getStats(boatModel, 90);

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(1)
    expect(onNotification.mock.calls[0][0]).toBe('leeward-mark')
});

test('Tack', () => {
    const boatModel = new BoatModel(0, 10, -30, 5, 0, 0, 0.5,1)
    boatModel.update(30, {cog:30})

    const onNotification = getStats(boatModel, 90);

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(1)
    expect(onNotification.mock.calls[0][0]).toBe('tack')
});

test('Gybe', () => {
    const boatModel = new BoatModel(0, 10, -150, 5, 0, 0, 0.5,1)
    boatModel.update(30, {cog:150})

    const onNotification = getStats(boatModel, 90);

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(1)
    expect(onNotification.mock.calls[0][0]).toBe('gybe')
});

test('Lift', () => {
    const boatModel = new BoatModel(0, 10, 30, 5, 0, 0, 0.5,0.5)

    // Lift 15 degrees
    boatModel.update(60, {twd: 360-15, cog:30})

    const onNotification = getStats(boatModel, 120);

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(3)
    expect(onNotification.mock.calls[1][0]).toBe('lift')
    expect(onNotification.mock.calls[1][2].shift).toBeCloseTo(utils.radians(-15) )
});

test('Stats on target', () => {
    const boatModel = new BoatModel(0, 10, 30, 5, 0, 0, 0, 0)

    const onNotification = getStats(boatModel, 120);

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(2)
    expect(onNotification.mock.calls[0][0]).toBe('target-stats')
    expect(onNotification.mock.calls[0][2].distance_delta).toBeCloseTo(0, 1)
    expect(onNotification.mock.calls[0][2].speed_delta).toBeCloseTo(0,1)
    expect(onNotification.mock.calls[0][2].twa_angle_delta).toBeCloseTo(0, 1)
});

test('Stats pinching', () => {
    const boatModel = new BoatModel(0, 10, 30, 5, 0, -10, 0, 0)

    const onNotification = jest.fn()
    const navStats = new NavStats(console.log, console.log, onNotification);

    boatModel.getDeltas(120).forEach(delta => {
        navStats.processDelta(delta)
    })

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(2)
    expect(onNotification.mock.calls[0][0]).toBe('target-stats')
    expect(onNotification.mock.calls[0][2].distance_delta).toBeCloseTo(10.07, 1)  // distance delta
    expect(onNotification.mock.calls[0][2].speed_delta).toBeCloseTo(0,1)  // speed delta
    expect(onNotification.mock.calls[0][2].twa_angle_delta).toBeCloseTo(utils.radians(-10), 1)  // twa delta
});
