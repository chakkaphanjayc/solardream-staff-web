/** Calculates solar angle of incidence using the product's Thailand estimate assumptions. */
export function calculateSunIncidence(pitchDegrees: number, orientationDegrees: number) {
  const pitchRad = (pitchDegrees * Math.PI) / 180;
  const azimuthRad = (orientationDegrees * Math.PI) / 180;
  const sunX = 0;
  const sunY = Math.sin((65 * Math.PI) / 180);
  const sunZ = -Math.cos((65 * Math.PI) / 180);
  const normalX = Math.sin(pitchRad) * Math.sin(azimuthRad);
  const normalY = Math.cos(pitchRad);
  const normalZ = Math.sin(pitchRad) * Math.cos(azimuthRad);
  const cosTheta = normalX * sunX + normalY * sunY + normalZ * sunZ;
  const clampedCosTheta = Math.max(-1, Math.min(1, cosTheta));
  const incidenceAngleRad = Math.acos(clampedCosTheta);
  const incidenceAngleDeg = (incidenceAngleRad * 180) / Math.PI;
  const efficiency = Math.max(0, clampedCosTheta) * 100;

  return { incidenceAngleDeg, efficiency, cosTheta: clampedCosTheta };
}
