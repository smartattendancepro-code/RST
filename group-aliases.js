
window.GROUP_ALIASES = {
    "1G20": ["1G1", "1G2", "1G3", "1G4", "1G5", "1G6"],
    "1G30": ["1G7", "1G8", "1G9", "1G10", "1G11", "1G12"],
    "2G20": ["2G1", "2G2", "2G3", "2G4", "2G5", "2G6"],
    "2G30": ["2G7", "2G8", "2G9", "2G10", "2G11", "2G12"],
};

window.resolveGroups = function (groupInput) {
    if (window.GROUP_ALIASES[groupInput]) {
        return window.GROUP_ALIASES[groupInput];
    }
    return [groupInput];
};