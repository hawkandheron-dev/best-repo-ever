/**
 * The conventional part list a philosopher gets cut into.
 *
 * Ordered as you should cut them — background limbs first, so each new part lands
 * on top of what it should occlude and you can see the figure assembling.  Keeping
 * to these ids means a rig cut here drops straight into anything expecting the
 * standard moveset, since the punch clips reach for `p.fistF` by name.
 */

import { Z } from '../fighter/rig/rigSchema';

export const PART_TARGETS = [
  { id: 'p.armB.up', bone: 'armB.up', label: 'Far upper arm', z: Z.ARM_B, group: 'Far side' },
  { id: 'p.armB.fore', bone: 'armB.fore', label: 'Far forearm', z: Z.ARM_B + 1, group: 'Far side' },
  { id: 'p.handB', bone: 'handB', label: 'Far hand', z: Z.ARM_B + 2, group: 'Far side' },
  { id: 'p.legB.thigh', bone: 'legB.thigh', label: 'Far thigh', z: Z.LEG_B, group: 'Far side' },
  { id: 'p.legB.shin', bone: 'legB.shin', label: 'Far shin', z: Z.LEG_B + 1, group: 'Far side' },
  { id: 'p.footB', bone: 'footB', label: 'Far foot', z: Z.LEG_B + 2, group: 'Far side' },

  { id: 'p.robeB', bone: 'robeB', label: 'Robe (back)', z: Z.ROBE_B, group: 'Body', optional: true },
  { id: 'p.torso', bone: 'torso', label: 'Torso', z: Z.TORSO, group: 'Body' },
  { id: 'p.head', bone: 'head', label: 'Head', z: Z.HEAD, group: 'Body' },
  { id: 'p.robeA', bone: 'robeA', label: 'Robe (front)', z: Z.ROBE_F, group: 'Body', optional: true },

  { id: 'p.legF.thigh', bone: 'legF.thigh', label: 'Near thigh', z: Z.LEG_F, group: 'Near side' },
  { id: 'p.legF.shin', bone: 'legF.shin', label: 'Near shin', z: Z.LEG_F + 1, group: 'Near side' },
  { id: 'p.footF', bone: 'footF', label: 'Near foot', z: Z.LEG_F + 2, group: 'Near side' },
  { id: 'p.armF.up', bone: 'armF.up', label: 'Near upper arm', z: Z.ARM_F, group: 'Near side' },
  { id: 'p.armF.fore', bone: 'armF.fore', label: 'Near forearm', z: Z.ARM_F + 1, group: 'Near side' },
  { id: 'p.handF', bone: 'handF', label: 'Near hand (open)', z: Z.HAND_F, group: 'Near side' },
  {
    id: 'p.fistF',
    bone: 'handF',
    label: 'Near hand (fist)',
    z: Z.HAND_F,
    group: 'Near side',
    optional: true,
    hint: 'Swapped in during punches. Re-cut the same hand clenched, or skip it.',
  },
];

/** Parts that must exist before a rig is worth exporting. */
export const REQUIRED_PARTS = PART_TARGETS.filter((p) => !p.optional).map((p) => p.id);

export const PART_GROUPS = [...new Set(PART_TARGETS.map((p) => p.group))];

/**
 * Which bone a part should be pivoted on, and the joint at its far end.
 * The far joint is what the studio uses to draw the "cover this too" guide — a
 * rigid part has to cover BOTH its joints or it gaps when either one bends.
 */
export const FAR_JOINT = {
  'armB.up': 'armB.fore',
  'armB.fore': 'handB',
  'legB.thigh': 'legB.shin',
  'legB.shin': 'footB',
  'armF.up': 'armF.fore',
  'armF.fore': 'handF',
  'legF.thigh': 'legF.shin',
  'legF.shin': 'footF',
  torso: 'chest',
  robeA: 'robeB',
};
