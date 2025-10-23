"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateCalories = void 0;
const calculateCalories = (gender, weight, height, age, activityLevel) => {
    let bmr;
    if (gender === "MALE") {
        bmr = 10 * weight + 6.25 * height - 5 * age + 5;
    }
    else {
        bmr = 10 * weight + 6.25 * height - 5 * age - 161;
    }
    const activityMultipliers = {
        SEDENTARY: 1.2,
        LIGHT: 1.375,
        MODERATE: 1.55,
        ACTIVE: 1.725,
        SUPER_ACTIVE: 1.9,
    };
    return bmr * (activityMultipliers[activityLevel] || 1.2);
};
exports.calculateCalories = calculateCalories;
//# sourceMappingURL=calculateCalories.js.map