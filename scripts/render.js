(function (global) {
  global.toolTipInit = function () {
    // Define the div for the tooltip
    d3.select("body")
      .append("div")
      .attr("class", "tooltip")
      .attr("id", global.toolTipId)
      .style("opacity", 0);
  };

  function infoPanel(state) {
    $("#nbNotYetTrains").text(state.notYet.length);
    $("#nbActiveTrains").text(state.active.length);
    $("#nbFinishedTrains").text(state.finished.length);
    $("#nbDisplayError").text(
      state.active.length - state.positionedTrains.length
    );
  }

  function hoverTrain(state, d) {
    // set hoveredTrip: only one at a time
    state.hoveredTrip = d.trip;

    // update tooltip
    d3.select(global.toolTipSelector)
      .style("left", d3.event.pageX + 8 + "px")
      .style("top", d3.event.pageY - 28 + "px")
      .transition()
      .duration(200)
      .style("opacity", 0.7)
      .text(
        "Train " +
          d.trip +
          " currently going from station " +
          d.atTime.observed.from.name +
          " to station " +
          d.atTime.observed.to.name +
          ", has an estimated delay of " +
          d.atTime.observed.estimatedDelay +
          " seconds."
      );
  }

  function unHoverTrain(state) {
    // set hovered trip as null
    state.hoveredTrip = null;
    // update tootlip
    d3.select(global.toolTipSelector)
      .transition()
      .duration(500)
      .style("opacity", 0);
  }

  function highlightTrain(d) {
    if (d === null) {
      highlightedTrip = null;
    } else {
      highlightedTrip = d.trip;
    }
    highlight();
    d3.event.stopPropagation();
  }

  function placeWithOffset(from, to, ratio) {
    // extrapolate position from trip ratio, previous station, and next station
    var fromPos = { lon: from.lon, lat: from.lat };
    var toPos = { lon: to.lon, lat: to.lat };

    var midpoint = d3.interpolate(
      [fromPos.lon, fromPos.lat],
      [toPos.lon, toPos.lat]
    )(ratio);
    var angle =
      Math.atan2(toPos.lat - fromPos.lat, toPos.lon - fromPos.lon) +
      Math.PI / 2;
    return [
      midpoint[0] + Math.cos(angle) * global.mapGlyphTrainCircleRadius,
      midpoint[1] + Math.sin(angle) * global.mapGlyphTrainCircleRadius,
    ];
  }

  function hoverStation(state, d) {
    state.hoveredStation = d.stop_id;
    // make name visible
    d3.select("#" + d.stop_id.slice(10)).classed("hover", true);
  }

  function unHoverStation(state, d) {
    // make name invisible
    d3.select("#" + d.stop_id.slice(10) + ".station-name").classed(
      "hover",
      false
    );
    state.hoveredStation = null;
  }

  global.drawStations = function (state, stations) {
    d3.select(global.svgSelector)
      .selectAll(".station")
      .data(stations, function (d) {
        return d.stop_id;
      })
      .enter()
      .append("circle")
      .attr("cx", function (d) {
        return d.lon;
      })
      .attr("cy", function (d) {
        return d.lat;
      })
      .attr("r", 4)
      .classed("hoverable station", true)
      .on("mouseover", hoverStation.bind(this, state))
      .on("mouseout", unHoverStation.bind(this, state))
      .on("click", function (d) {
        console.log(d);
      });
  };

  global.drawSections = function (sections) {
    const lineFunction = d3.svg
      .line()
      .x(function (d) {
        if (d) {
          return d.lon;
        }
      })
      .y(function (d) {
        if (d) {
          return d.lat;
        }
      })
      .interpolate("cardinal");

    d3.select(global.svgSelector)
      .selectAll(".section")
      .data(sections, function (d) {
        return d.name;
      })
      .enter()
      .append("path")
      .attr("d", function (d) {
        return lineFunction(d.pointsCoord);
      })
      .classed("section", true)
      .on("click", function (d) {
        console.log("Section " + d.name);
      })
      .each(function (d) {
        d.totalLength = this.getTotalLength();
      });
  };

  // DRAWING FUNCTIONS
  global.renderAllAtTime = function (
    unixSeconds,
    transitionDisabled,
    displayScheduled,
    state
  ) {
    /* Find all active, notYet, and finished trains:
        - either based on schedule
        - either based on observations
        */

    var type; // two options: either scheduled, or observed

    // checks time and transition time

    if (displayScheduled) {
      state.active = state.trips.filter(function (d) {
        return global.isActiveScheduled(unixSeconds, d);
      });

      state.finished = state.trips.filter(function (d) {
        return d.end < unixSeconds;
      });

      state.notYet = state.trips.filter(function (d) {
        return d.begin > unixSeconds;
      });

      type = "scheduled";
    } else {
      state.active = state.trips.filter(function (d) {
        return global.isActiveObserved(unixSeconds, d);
      });

      state.finished = state.trips.filter(function (d) {
        return d.ObservedEnd < unixSeconds;
      });

      state.notYet = state.trips.filter(function (d) {
        return d.ObservedBegin > unixSeconds;
      });

      type = "observed";
    }

    // FIND TRAINS POSITIONS
    state.positionedTrains = state.active
      .map(
        global.setTrainsPositions.bind(this, unixSeconds, state.preciseGraph)
      )
      .filter(function (train) {
        if (!train) {
          return;
        }
        if (
          train.atTime.scheduled.pos &&
          train.atTime.scheduled.acceptedEdge &&
          state.displayScheduled
        ) {
          return train;
        }
        if (
          train.atTime.observed.pos &&
          train.atTime.observed.acceptedEdge &&
          state.displayObserved
        ) {
          return train;
        }
      });

    infoPanel(state);

    drawTrainsAtTime(
      unixSeconds,
      transitionDisabled,
      state.transitionTime,
      state.positionedTrains,
      state.displayObserved,
      state.highlightedTrip,
      state.hoveredTrip,
      state
    );

    // Compute and render delays evolution
    state.sectionManager.refreshAtTime(
      unixSeconds,
      state.positionedTrains,
      state.lastTime
    );
    global.renderJam(transitionDisabled, state);

    // Table of active trains
    const activeDatatableFormat = state.active.map(
      global.parseDatatableTrain.bind(this, type)
    );
    global.updateTableData(activeDatatableFormat);
  };

  global.getColorScale = function () {
    return d3.scale
      .linear()
      .interpolate(d3.interpolateLab)
      .domain([-300, 60, 600])
      .range(["rgb(0, 104, 55)", "rgb(255, 255, 255)", "rgb(165, 0, 38)"]);
  };

  function drawTrainsAtTime(
    unixSeconds,
    transitionDisabled,
    transitionTime,
    positionedTrains,
    displayObserved,
    highlightedTrip,
    hoveredTrip,
    state
  ) {
    if (transitionDisabled) {
      transitionTime = 0;
    }

    // DISPLAY TRAINS
    var trainsGroups = d3
      .select("#map-svg")
      .selectAll(".train")
      .data(positionedTrains, function (d) {
        return d.trip;
      });

    if (displayObserved) {
      // OBSERVED

      // Update
      trainsGroups
        .transition()
        .duration(transitionTime)
        .attr("cx", function (d) {
          return d.atTime.observed.pos[0];
        })
        .attr("cy", function (d) {
          return d.atTime.observed.pos[1];
        })
        .attr("fill", function (d) {
          return global.delayMapColorScale(d.atTime.observed.estimatedDelay);
        })
        .attr("r", global.mapGlyphTrainCircleRadius - 0.5)
        .attr("opacity", displayObserved);

      // Enter
      trainsGroups
        .enter()
        .append("circle")
        .attr("class", function (d) {
          return "highlightable hoverable dimmable " + d.line;
        })
        .classed("active", function (d) {
          return d.trip === highlightedTrip;
        })
        .classed("hover", function (d) {
          return d.trip === hoveredTrip;
        })
        .classed("train", true)
        .classed("observed", true)
        .on("mouseover", hoverTrain.bind(this, state))
        .on("mouseout", unHoverTrain.bind(this, state))
        .on("click", function (d) {
          console.log(d);
          console.log("observed");
        })
        .attr("r", 2)
        .attr("opacity", displayObserved)
        .attr("fill", "lightgreen")
        .attr("cx", function (d) {
          return d.stops[0].stop.lon;
        })
        .attr("cy", function (d) {
          return d.stops[0].stop.lat;
        });
    } else {
      // SCHEDULE
      // Update
      trainsGroups
        .transition()
        .duration(transitionTime)
        .attr("cx", function (d) {
          return d.atTime.scheduled.pos[0];
        })
        .attr("cy", function (d) {
          return d.atTime.scheduled.pos[1];
        })
        .attr("fill", "steelblue")
        .attr("r", global.mapGlyphTrainCircleRadius - 0.5)
        .attr("opacity", displayScheduled);

      // Enter
      trainsGroups
        .enter()
        .append("circle")
        .attr("class", function (d) {
          return "highlightable hoverable dimmable " + d.line;
        })
        .classed("active", function (d) {
          return d.trip === highlightedTrip;
        })
        .classed("hover", function (d) {
          return d.trip === hoveredTrip;
        })
        .classed("train", true)
        .classed("scheduled", true)
        .on("mouseover", hoverTrain.bind(this, state))
        .on("mouseout", unHoverTrain.bind(this, state))
        .on("click", function (d) {
          console.log(d);
          console.log("scheduled");
        })
        .attr("r", 2)
        .attr("opacity", displayScheduled)
        .attr("fill", "lightgreen")
        .attr("cx", function (d) {
          return d.stops[0].stop.lon;
        })
        .attr("cy", function (d) {
          return d.stops[0].stop.lat;
        });
    }

    // Exit
    trainsGroups
      .exit()
      .transition()
      .duration(transitionTime)
      // first finish till last station then disapear
      .attr("cx", function (d) {
        return d.stops[d.stops.length - 1].stop.lon;
      })
      .attr("cy", function (d) {
        return d.stops[d.stops.length - 1].stop.lat;
      })
      .attr("fill", "grey")
      .attr("r", 3)
      .remove();
  }

  global.drawStationsNames = function (stations) {
    d3.select(global.svgSelector)
      .selectAll("station-name")
      .data(stations)
      .enter()
      .append("text")
      .classed("station-name", true)
      .attr("opacity", function (d) {
        return global.visibleStations.find(function (st) {
          return st.id === d.stop_id;
        })
          ? 1
          : 0;
      })
      .text(function (d) {
        return d.name;
      })
      .attr("id", function (d) {
        return d.stop_id.slice(10);
      })
      .attr("text-anchor", function (d) {
        var station = global.visibleStations.find(function (st) {
          return st.id === d.stop_id;
        });
        var reverse;
        if (station) {
          reverse = station.reverse;
        }
        return reverse ? "end" : "start";
      })
      .attr("transform", function (d) {
        var station = global.visibleStations.find(function (st) {
          return st.id === d.stop_id;
        });
        var reverse;
        if (station) {
          reverse = station.reverse;
        }
        var offset = reverse ? -5 : 5;
        return "translate(" + (d.lon + offset) + "," + d.lat + ") rotate(-15)";
      });
  };

  global.setTrainsPositions = function (unixSeconds, graph, train) {
    /*
        Find positions based on schedule and based on observations.
        TODO: take into account if real stops or not for timing.
        */

    // SCHEDULED
    // Find which is last passed station
    for (var i = 0; i < train.stops.length - 1; i++) {
      if (train.stops[i + 1].scheduledTime > unixSeconds) {
        break;
      }
    }
    var sfrom = train.stops[i];
    var sto = train.stops[i + 1];
    var sacceptedEdge, sratio, spos, sfromStop, stoStop;

    if (sfrom && sto) {
      sfromStop = sfrom.stop;
      stoStop = sto.stop;
      // Check if real edge of precise graph
      sacceptedEdge = graph.isEdge(sfromStop.stop_id, stoStop.stop_id);
      // Find ratio
      sratio =
        (unixSeconds - sfrom.scheduledTime) /
        (sto.scheduledTime - sfrom.scheduledTime);
      // Compute position object given: from, to and ratio
      spos = placeWithOffset(sfromStop, stoStop, sratio);
    }

    const scheduled = {
      from: sfromStop,
      to: stoStop,
      timeRatio: sratio,
      pos: spos,
      acceptedEdge: sacceptedEdge,
    };

    // OBSERVED (with extrapolation when no data is found)
    for (var j = 0; j < train.stops.length - 1; j++) {
      if (train.stops[j + 1].estimatedTime > unixSeconds) {
        break;
      }
    }

    var efrom = train.stops[j];
    var eto = train.stops[j + 1];
    var eacceptedEdge,
      eratio,
      epos,
      previousEstimatedDelay,
      nextEstimatedDelay,
      estimatedDelayEvolution,
      estimatedDelay,
      efromStop,
      etoStop;

    if (efrom && eto) {
      // Check if real edge of precise graph
      eacceptedEdge = graph.isEdge(efrom.stop.stop_id, eto.stop.stop_id);
      // Find ratio
      eratio =
        (unixSeconds - efrom.estimatedTime) /
        (eto.estimatedTime - efrom.estimatedTime);
      // compute position object given: from, to and ratio
      epos = placeWithOffset(efrom.stop, eto.stop, eratio);

      previousEstimatedDelay = efrom.estimatedDelay;
      nextEstimatedDelay = eto.estimatedDelay;

      estimatedDelayEvolution = nextEstimatedDelay - previousEstimatedDelay;
      estimatedDelay =
        eratio * nextEstimatedDelay + (1 - eratio) * previousEstimatedDelay;

      efromStop = efrom.stop;
      etoStop = eto.stop;
    }

    const observed = {
      from: efromStop,
      to: etoStop,
      timeRatio: eratio,
      pos: epos,
      acceptedEdge: eacceptedEdge,
      previousEstimatedDelay: previousEstimatedDelay,
      nextEstimatedDelay: nextEstimatedDelay,
      estimatedDelayEvolution: estimatedDelayEvolution,
      estimatedDelay: estimatedDelay,
    };

    train.atTime = {
      renderedAtTime: unixSeconds,
      scheduled: scheduled,
      observed: observed,
    };
    return train;
  };
})(window.H);
