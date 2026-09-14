/**
 * Calculates the solar angle of incidence and relative efficiency.
 * Sun Altitude = 65°, Sun Azimuth = 180° (South).
 * @param pitchDegrees Roof pitch in degrees
 * @param orientationDegrees Roof orientation in degrees (0 = North, 90 = East, 180 = South, 270 = West)
 */
export function calculateSunIncidence(pitchDegrees: number, orientationDegrees: number) {
  const pitchRad = (pitchDegrees * Math.PI) / 180;
  const azimuthRad = (orientationDegrees * Math.PI) / 180;

  // Sun Vector S in Cartesian (East = +x, Up = +y, North = +z)
  // Sun Azimuth = 180 deg (South), Altitude = 65 deg
  // S_x = sin(180) * cos(65) = 0
  // S_y = sin(65)
  // S_z = cos(180) * cos(65) = -cos(65)
  const sunX = 0;
  const sunY = Math.sin((65 * Math.PI) / 180);
  const sunZ = -Math.cos((65 * Math.PI) / 180);

  // Roof Normal Vector N
  // N_x = sin(pitch) * sin(azimuth)
  // N_y = cos(pitch)
  // N_z = sin(pitch) * cos(azimuth)
  const normalX = Math.sin(pitchRad) * Math.sin(azimuthRad);
  const normalY = Math.cos(pitchRad);
  const normalZ = Math.sin(pitchRad) * Math.cos(azimuthRad);

  // Dot product
  const cosTheta = normalX * sunX + normalY * sunY + normalZ * sunZ;
  
  // Angle of incidence (theta) in degrees
  const clampedCosTheta = Math.max(-1, Math.min(1, cosTheta));
  const incidenceAngleRad = Math.acos(clampedCosTheta);
  const incidenceAngleDeg = (incidenceAngleRad * 180) / Math.PI;

  // Efficiency score E = max(0, cos(theta)) * 100
  const efficiency = Math.max(0, clampedCosTheta) * 100;

  return {
    incidenceAngleDeg,
    efficiency,
    cosTheta: clampedCosTheta
  };
}
