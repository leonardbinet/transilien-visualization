import {
  scale,
  svgSelector,
  maxFreshness,
  line,
  subsectionWidth,
} from "./constant.js";
import { weightedMean } from "./math.js";

const distScale = d3.scale
  .linear()
  .domain([0, 100])
  .range([0.15 * scale, 0.7 * scale]);

// create svg path from array of points
const encodeSvgLine = d3.svg
  .line()
  .x(function (d) {
    return d[0];
  })
  .y(function (d) {
    return d[1];
  })
  .defined(function (d) {
    return !!d;
  })
  .interpolate("linear");

// returns color given a delay
const redGreenDelayColorScale = d3.scale
  .linear()
  .interpolate(d3.interpolateLab)
  .domain([-300, 0, 300])
  .range(["rgb(0, 104, 55)", "rgb(255, 255, 255)", "rgb(165, 0, 38)"]);

function subsectionDelayEvolution(direction, subsection, lastTime) {
  // list of last observed trains
  // check if info:
  if (!subsection.atTime) {
    return 0;
  }

  var cachedDir;
  if (direction === "dir0") {
    cachedDir = "cachedDir0";
  }
  if (direction === "dir1") {
    cachedDir = "cachedDir1";
  }
  const lastTrainsCache = subsection.atTime.observed[cachedDir];

  const trainsDelayEvolutions = lastTrainsCache.map(function (cachedTrain) {
    return cachedTrain.delayEvolutionOnSubsection;
  });

  const delayWeights = lastTrainsCache.map(function (cachedTrain) {
    // 0 means current, +120 means 2 mins ago
    const freshness = lastTime - cachedTrain.lastObservedTimeOnSubsection;

    if (freshness > maxFreshness) {
      return 0;
    }
    return 1 - freshness / maxFreshness;
  });
  const weightedValues = trainsDelayEvolutions.map(function (val, i) {
    return val * delayWeights[i];
  });

  return weightedMean(weightedValues, delayWeights);
}

// returns color given a segment
function mapGlyphSegmentColor(direction, lastTime, segment) {
  //console.log(segment)
  const delayEvolution =
    subsectionDelayEvolution(direction, segment.subsection, lastTime) || 0;
  return redGreenDelayColorScale(delayEvolution);
}

/* Miscellaneous utilities
 *
 * Primarily geometric equations for determining intersection
 * points between lines in the map glyph to decide where to put
 * the vertices of each polygon
 *************************************************************/
function getSubsectionsGoingToNode(station) {
  return station.linkedSubSections.map(function (subsection) {
    var segment;
    var ids;
    if (subsection.to === station) {
      segment = [
        [subsection.from.lon, subsection.from.lat],
        [subsection.to.lon, subsection.to.lat],
      ];
      ids = subsection.from.stop_id + "|" + subsection.to.stop_id;
    } else {
      segment = [
        [subsection.to.lon, subsection.to.lat],
        [subsection.from.lon, subsection.from.lat],
      ];
      ids = subsection.to.stop_id + "|" + subsection.from.stop_id;
    }
    return {
      segment: segment,
      line: line,
      ids: ids,
    };
  });
}

function getSubsectionsLeavingFromNode(station) {
  return station.linkedSubSections.map(function (subsection) {
    var segment;
    var ids;
    if (subsection.from === station) {
      segment = [
        [subsection.from.lon, subsection.from.lat],
        [subsection.to.lon, subsection.to.lat],
      ];
      ids = subsection.from.stop_id + "|" + subsection.to.stop_id;
    } else {
      segment = [
        [subsection.to.lon, subsection.to.lat],
        [subsection.from.lon, subsection.from.lat],
      ];
      ids = subsection.to.stop_id + "|" + subsection.from.stop_id;
    }
    return {
      segment: segment,
      line: line,
      ids: ids,
    };
  });
}

function closestClockwise(thisLine, otherLines) {
  const origAngle = angle(thisLine.segment);
  otherLines = otherLines || [];
  var result = null;
  var minAngle = Infinity;
  otherLines.forEach(function (other) {
    if (segmentsAreSame(other, thisLine)) {
      return;
    }
    var thisAngle = angle(other.segment) + Math.PI;
    var diff = -normalize(thisAngle - origAngle);
    if (diff < minAngle) {
      minAngle = diff;
      result = other;
    }
  });
  return result;
}

function closestCounterClockwise(thisLine, otherLines) {
  const origAngle = angle(thisLine.segment);
  otherLines = otherLines || [];
  var result = null;
  var minAngle = Infinity;
  otherLines.forEach(function (other) {
    const thisAngle = angle(other.segment);
    const diff = normalize(origAngle - thisAngle);
    const absDiff = Math.abs(diff);
    if (absDiff < 0.2 || Math.abs(absDiff - Math.PI) < 0.2) {
      return;
    }
    if (diff < minAngle) {
      minAngle = diff;
      result = other;
    }
  });
  return result;
}

function segmentsAreSame(a, b) {
  const sega = JSON.stringify(a.segment);
  const segb = JSON.stringify(b.segment);
  return sega === segb;
}

function normalize(angle) {
  return ((Math.PI * 4 + angle) % (Math.PI * 2)) - Math.PI;
}

function angle(source, dest) {
  if (arguments.length === 1) {
    const origP1 = source;
    source = origP1[0];
    dest = origP1[1];
  }
  return Math.atan2(dest[1] - source[1], dest[0] - source[0]);
}

function offsetPoints(link) {
  // Here is decided how large the rectangle is at points 3 and 4
  const split = link.ids.split("|").map(function (a) {
    return distScale(subsectionWidth || 0);
  });
  const p1 = link.segment[0];
  const p2 = link.segment[1];
  const lineAngle = angle(p1, p2);
  const angle90 = lineAngle + Math.PI / 2;
  const p3 = [
    p2[0] + split[1] * Math.cos(angle90),
    p2[1] + split[1] * Math.sin(angle90),
  ];
  const p4 = [
    p1[0] + split[0] * Math.cos(angle90),
    p1[1] + split[0] * Math.sin(angle90),
  ];
  return [p4, p3];
}

function slope(line) {
  return (line[1][1] - line[0][1]) / (line[1][0] - line[0][0]);
}

function intercept(line) {
  // y = mx + b
  // b = y - mx
  return line[1][1] - slope(line) * line[1][0];
}

function intersect(line1, line2) {
  const m1 = slope(line1);
  const b1 = intercept(line1);
  const m2 = slope(line2);
  const b2 = intercept(line2);
  const m1Infinite = m1 === Infinity || m1 === -Infinity;
  const m2Infinite = m2 === Infinity || m2 === -Infinity;
  var x, y;
  if ((m1Infinite && m2Infinite) || Math.abs(m2 - m1) < 0.01) {
    return null;
  } else if (m1Infinite) {
    x = line1[0][0];
    // y = mx + b
    y = m2 * x + b2;
    return [x, y];
  } else if (m2Infinite) {
    x = line2[0][0];
    y = m1 * x + b1;
    return [x, y];
  } else {
    x = (b2 - b1) / (m1 - m2);
    y = m1 * x + b1;
    return [x, y];
  }
}

function mapGlyphSegmentVertices(direction, link) {
  const p1 = link.segment[0];
  const p2 = link.segment[1];
  const offsets = offsetPoints(link);
  var p3 = offsets[1];
  var p4 = offsets[0];
  var first;

  first = closestClockwise(link, link.outgoing);
  if (first && link.outgoing.length > 1) {
    const outgoingPoints = offsetPoints(first);
    const newP3 = intersect(offsets, outgoingPoints);
    if (newP3) {
      p3 = newP3;
    }
  }
  first = closestCounterClockwise(link, link.incoming);
  if (first && link.incoming.length > 1) {
    const incomingPoints = offsetPoints(first);
    const newP4 = intersect(offsets, incomingPoints);
    if (newP4) {
      p4 = newP4;
    }
  }
  return encodeSvgLine([p1, p2, p3, p4, p1]);
}

// Handle when the mouse is moved over a particular time on the horizon/color band chart
export function renderJam(transitionDisabled, state) {
  const ttime = transitionDisabled ? 0 : state.transitionTime;

  // INITIAL DRAWING
  // tell the glyph to redraw
  d3.select(svgSelector)
    .selectAll("path.dir0")
    .transition()
    .duration(ttime)
    .attr("fill", mapGlyphSegmentColor.bind(this, "dir0", state.lastTime))
    .attr("d", mapGlyphSegmentVertices.bind(this, "dir0"));

  d3.select(svgSelector)
    .selectAll("path.dir1")
    .transition()
    .duration(ttime)
    .attr("fill", mapGlyphSegmentColor.bind(this, "dir1", state.lastTime))
    .attr("d", mapGlyphSegmentVertices.bind(this, "dir1"));
}

export function drawInitialSubsectionsJam(sections, state) {
  // INITIAL DRAWING

  // *************************************************************/

  /* DATA FORMAT
        In state.sections[i].subsections
        {
            from: {
                stop_id: "id",
                name: "name",
                lon: "",
                lat: ""
            }
            to: {
                stop_id: "id",
                name: "name",
                lon: "",
                lat: ""
            }    
        }
        */

  const subsections = [].concat.apply(
    [],
    sections.map(function (section) {
      return section.subsections;
    })
  );

  // VIZ CREATION
  // create connection groups
  const glyphSegmentOutlines = d3
    .select(svgSelector)
    .selectAll(".connect")
    .data(subsections)
    .enter()
    .append("g")
    .attr("class", "connect");

  // DIR0: from -> to PATH
  glyphSegmentOutlines
    .append("g")
    .attr("class", function (d) {
      return "-glyph " + d.from.stop_id + "-" + d.to.stop_id;
    })
    .append("path")
    .classed("section-jam", true)
    .classed("dir0", true)
    .datum(function (d) {
      return {
        incoming: getSubsectionsGoingToNode(d.from),
        line: "H",
        ids: d.from.stop_id + "|" + d.to.stop_id,
        segment: [
          [d.from.lon, d.from.lat],
          [d.to.lon, d.to.lat],
        ],
        outgoing: getSubsectionsLeavingFromNode(d.to),
        name: d.from.name + " to " + d.to.name,
        subsection: d,
      };
    })
    .attr("fill", mapGlyphSegmentColor.bind(this, "dir0", state.lastTime))
    .attr("d", mapGlyphSegmentVertices.bind(this, "dir0"));

  // DIR1 to -> from PATH
  glyphSegmentOutlines
    .append("g")
    .attr("class", function (d) {
      return "-glyph " + d.to.stop_id + "-" + d.from.stop_id;
    })
    .append("path")
    .classed("section-jam", true)
    .classed("dir1", true)
    .datum(function (d) {
      return {
        incoming: getSubsectionsGoingToNode(d.to),
        line: "H",
        ids: d.to.stop_id + "|" + d.from.stop_id,
        segment: [
          [d.to.lon, d.to.lat],
          [d.from.lon, d.from.lat],
        ],
        outgoing: getSubsectionsLeavingFromNode(d.from),
        name: d.to.name + " to " + d.from.name,
        subsection: d,
      };
    })
    .attr("fill", mapGlyphSegmentColor.bind(this, "dir1", state.lastTime))
    .attr("d", mapGlyphSegmentVertices.bind(this, "dir1"));
}
