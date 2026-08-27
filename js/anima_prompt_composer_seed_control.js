const PATCHED_FLAG = "__animaComposerPartialExecutionPatched";
const CONTROL_VALUES = ["fixed", "increment", "decrement", "randomize"];

function isSeedControlWidget(widget) {
    const values = widget?.options?.values;
    return Array.isArray(values) && CONTROL_VALUES.every(value => values.includes(value));
}

function fullExecutionOptions(options) {
    if (!options?.isPartialExecution) return options;
    return { ...options, isPartialExecution: false };
}

export function enablePartialExecutionSeedControl(seedWidget) {
    const controlWidget = seedWidget?.linkedWidgets?.find(isSeedControlWidget);
    if (!controlWidget || controlWidget[PATCHED_FLAG]) return false;

    for (const callbackName of ["beforeQueued", "afterQueued"]) {
        const originalCallback = controlWidget[callbackName];
        if (typeof originalCallback !== "function") continue;
        controlWidget[callbackName] = function (options) {
            return originalCallback.call(this, fullExecutionOptions(options));
        };
    }

    controlWidget[PATCHED_FLAG] = true;
    return true;
}
