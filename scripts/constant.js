(function(global) {

    //// Selectors
    global.svgId = "map-svg"
    global.svgSelector = `#${global.svgId}`;
    global.toolTipId = "tooltip"
    global.toolTipSelector = `#${global.toolTipId}`;
    // Canvas parameters
    global.hborder = 25;
    global.wborder = 80;
    global.w = 500 + 2 * global.wborder;
    global.h = 500 + 2 * global.hborder;

    // Chosen line
    global.line = "H";
    // Size of trains: to compute distance from path
    global.mapGlyphTrainCircleRadius = 4.0;

    // Timer
    global.smoothness = 0.7;

    // Subsections cache for computing delay evolutions
    global.subsectionsMaxCachedElements = 8;
    // max taken into account is 20 mins
    global.maxFreshness = 1200;
    // Subsection width (scaled afterwards)
    global.subsectionWidth = 40;
    global.scale = 20;

    global.visibleStations = [
        { id: "StopPoint:DUA8727600" },
        { id: "StopPoint:DUA8727103" },
        { id: "StopPoint:DUA8727613", reverse: true },
        { id: "StopPoint:DUA8727657" }
    ];


}(window.H))