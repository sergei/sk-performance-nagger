const BoatModel = require("./boat_model");
const {NavStats} = require("../src/nav_stats");

function getStats(boatModel) {
    const onNotification = jest.fn()
    const navStats = new NavStats(console.log, console.log, onNotification);

    boatModel.getDeltas(120).forEach(delta => {
        navStats.processDelta(delta)
    })
    return onNotification;
}

test('Ignore short intervals', () => {
    const boatModel = new BoatModel(0, 10, -30, 5, 0, 0, 0.5,1)
    const onNotification = getStats(boatModel);

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(0)
});

test('Windward rounding', () => {
    const boatModel = new BoatModel(0, 10, -30, 5, 0, 0, 0.5,1)
    boatModel.update(30, {cog:-150})

    const onNotification = getStats(boatModel);

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(1)
    expect(onNotification.mock.calls[0][0]).toBe('windward-mark')
});

test('Leeward rounding', () => {
    const boatModel = new BoatModel(0, 10, -150, 5, 0, 0, 0.5,1)
    boatModel.update(30, {cog:30})

    const onNotification = getStats(boatModel);

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(1)
    expect(onNotification.mock.calls[0][0]).toBe('leeward-mark')
});

test('Tack', () => {
    const boatModel = new BoatModel(0, 10, -30, 5, 0, 0, 0.5,1)
    boatModel.update(30, {cog:30})

    const onNotification = getStats(boatModel);

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(1)
    expect(onNotification.mock.calls[0][0]).toBe('tack')
});

test('Gybe', () => {
    const boatModel = new BoatModel(0, 10, -150, 5, 0, 0, 0.5,1)
    boatModel.update(30, {cog:150})

    const onNotification = getStats(boatModel);

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(1)
    expect(onNotification.mock.calls[0][0]).toBe('gybe')
});
