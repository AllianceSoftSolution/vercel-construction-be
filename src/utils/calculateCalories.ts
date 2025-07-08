export const calculateCalories = (
  gender: string,
  weight: number,
  height: number,
  age: number,
  activityLevel: string
): number => {
  let bmr: number;

  // Calculate BMR based on gender
  if (gender === "MALE") {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  }

  // Calculate calories based on activity level
  const activityMultipliers: { [key: string]: number } = {
    SEDENTARY: 1.2,
    LIGHT: 1.375,
    MODERATE: 1.55,
    ACTIVE: 1.725,
    SUPER_ACTIVE: 1.9,
  };

  return bmr * (activityMultipliers[activityLevel] || 1.2);
};
