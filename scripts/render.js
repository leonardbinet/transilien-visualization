(function(global) {

    function hoverStation(state, d) {
        state.hoveredStation = d.stop_id;
        // make name visible
        d3.select("#" + d.stop_id.slice(10))
            .classed('hover', true);
    }

    function unHoverStation(state, d) {
        // make name invisible
        d3.select("#" + d.stop_id.slice(10) + ".station-name")
            .classed('hover', false);
        state.hoveredStation = null;
    }

    global.drawStations = function(state, stations) {
        d3.select(global.svgSelector).selectAll(".station")
            .data(stations, function(d) { return d.stop_id })
            .enter()
            .append("circle")
            .attr("cx", function(d) { return d.lon })
            .attr("cy", function(d) { return d.lat })
            .attr("r", 4)
            .classed("hoverable station", true)
            .on('mouseover', hoverStation.bind(this, state))
            .on('mouseout', unHoverStation.bind(this, state))
            .on('click', function(d) { console.log(d); })
    }

    global.drawSections = function(sections) {
        const lineFunction = d3.svg.line()
            .x(function(d) { if (d) { return d.lon; } })
            .y(function(d) { if (d) { return d.lat; } })
            .interpolate("cardinal");

        d3.select(global.svgSelector).selectAll(".section")
            .data(sections, function(d) { return d.name })
            .enter()
            .append("path")
            .attr("d", function(d) { return lineFunction(d.pointsCoord) })
            .classed("section", true)
            .on("click", function(d) { console.log('Section ' + d.name) })
            .each(function(d) { d.totalLength = this.getTotalLength(); });
    }

}(window.H))