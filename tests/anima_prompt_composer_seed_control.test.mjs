import assert from "node:assert/strict";

import { enablePartialExecutionSeedControl } from "../js/anima_prompt_composer_seed_control.js";

function makeSeedWidget() {
    const seedWidget = { value: 10 };
    const calls = [];
    const controlWidget = {
        options: {
            values: ["fixed", "increment", "decrement", "randomize"],
        },
        beforeQueued(options = {}) {
            calls.push(["before", options.isPartialExecution]);
            if (!options.isPartialExecution) seedWidget.value += 1;
        },
        afterQueued(options = {}) {
            calls.push(["after", options.isPartialExecution]);
            if (!options.isPartialExecution) seedWidget.value += 100;
        },
    };
    seedWidget.linkedWidgets = [controlWidget];
    return { seedWidget, controlWidget, calls };
}

{
    const { seedWidget, controlWidget, calls } = makeSeedWidget();

    assert.equal(enablePartialExecutionSeedControl(seedWidget), true);
    controlWidget.beforeQueued({ isPartialExecution: true });
    controlWidget.afterQueued({ isPartialExecution: true });

    assert.equal(seedWidget.value, 111);
    assert.deepEqual(calls, [["before", false], ["after", false]]);
}

{
    const { seedWidget, controlWidget, calls } = makeSeedWidget();

    assert.equal(enablePartialExecutionSeedControl(seedWidget), true);
    assert.equal(enablePartialExecutionSeedControl(seedWidget), false);
    controlWidget.beforeQueued({ isPartialExecution: true });

    assert.equal(seedWidget.value, 11);
    assert.deepEqual(calls, [["before", false]]);
}

{
    const unrelatedControl = {
        options: { values: ["fixed", "randomize"] },
        beforeQueued() {},
    };

    assert.equal(enablePartialExecutionSeedControl({ linkedWidgets: [unrelatedControl] }), false);
}

console.log("anima_prompt_composer_seed_control tests passed");
