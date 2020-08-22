(function (global) {
  global.renderTimeSlider = function (min, max, state) {
    $("#slider").slider({
      step: 2,
      orientation: "horizontal",
      animate: "slow",
      value: min + 18000,
      min: min,
      max: max,
      slide: function (event, ui) {
        $("#slider-text").text(
          moment(ui.value * 1000).format("MMMM Do YYYY, h:mm:ss a")
        );
        $("#slider-title").text(
          moment(ui.value * 1000).format("MMMM Do YYYY, h:mm:ss a")
        );

        global.renderAllAtTime(ui.value, true, state.displayScheduled, state);
        state.lastTime = ui.value;
      },
      change: function (event, ui) {
        $("#slider-text").text(
          moment(ui.value * 1000).format("MMMM Do YYYY, h:mm:ss a")
        );
        $("#slider-title").text(
          moment(ui.value * 1000).format("MMMM Do YYYY, h:mm:ss a")
        );

        global.renderAllAtTime(ui.value, false, state.displayScheduled, state);
        state.lastTime = ui.value;
      },
    });
  };

  global.sliderTimerUpdate = function (state) {
    // set value
    // previous time
    const previous = $("#slider").slider("option", "value");

    $("#slider").slider("value", previous + state.timerAdd);
    if (state.timerActivated) {
      setTimeout(global.sliderTimerUpdate, state.timerDelay, state);
    }
  };

  global.setButtonInitialState = function (state) {
    // Timer button
    $("#button").on("click", function () {
      state.timerActivated = !state.timerActivated;
      global.sliderTimerUpdate(state);
      if (state.timerActivated) {
        $("#button").text("Stop");
      } else {
        $("#button").text("Start");
      }
    });
    // Scheduled button
    $("#scheduled")
      .closest("label")
      .on("click", function () {
        console.log("Display Schedule");
        state.displayScheduled = 1;
        state.displayObserved = 0;
      });
    // Observed button
    $("#observed")
      .closest("label")
      .on("click", function () {
        console.log("Display Observed");
        state.displayObserved = 1;
        state.displayScheduled = 0;
      });
  };

  global.renderSpeedSlider = function (state) {
    $("#speed").slider({
      orientation: "horizontal",
      animate: "slow",
      value: state.timeSpeed,
      min: 0,
      max: 500,
      slide: function (event, ui) {
        $("#speed-value").text(ui.value);
        state.timeSpeed = ui.value;
        global.recomputeTiming(state);
      },
    });
  };

  global.renderTimerDelaySlider = function (state) {
    $("#timer-delay").slider({
      orientation: "horizontal",
      animate: "slow",
      value: state.timerDelay,
      min: 15,
      max: 150,
      slide: function (event, ui) {
        $("#timer-delay-value").text(ui.value);
        state.timerDelay = ui.value;
        global.recomputeTiming(state);
      },
    });
  };

  global.recomputeTiming = function (state) {
    state.timerAdd = (state.timerDelay * state.timeSpeed) / 1000; // will add n seconds at each iteration
    // Transition time (shouldn't be much bigger than timerDelay)
    state.transitionTime = state.timerDelay * global.smoothness;
  };
})(window.H);
