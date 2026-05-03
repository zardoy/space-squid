/**
 * Built-in `chunkTemplate` examples.  Reference one from config with:
 *
 *   "chunkTemplate": "[castle]"        // case-insensitive
 *   "chunkTemplate": "[pirate_ship]"
 *   "chunkTemplate": "[skyscraper]"
 *
 * Each template uses the strict `Y<n>: row | row | …` format documented on
 * `parseTemplate`.  All builds start at world Y `baseY` (default 64) and
 * extend upward.  Default `blockMap` is assumed (C=cobblestone, M=mossy,
 * G=glass, R=red_wool, D=dark_oak_planks, I=iron_block, S=stone, B=bricks,
 * W=oak_planks, Y=gold_block, T=stone_bricks, Q=quartz_block, H=sandstone,
 * U=sea_lantern, F=oak_log, …).
 */

// ---------------------------------------------------------------------------
// CASTLE — 16×16×16  Classic medieval keep with corner towers, gate, banners.
// ---------------------------------------------------------------------------
const CASTLE = `
Y0:  4C4M4C4M | 4M8C4M | 4C4M4C4M | 4M8C4M | 4C4M4C4M | 4M8C4M | 4C4M4C4M | 4M8C4M
   | 4C4M4C4M | 4M8C4M | 4C4M4C4M | 4M8C4M | 4C4M4C4M | 4M8C4M | 4C4M4C4M | 4M8C4M
Y1:  16C | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC
   | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC | 16C
Y2:  16C | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC
   | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC | 16C
Y3:  16C | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC
   | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC | 16C
Y4:  16C | C14AC | 6C4G6C | C14AC | C14AC | C14AC | C14AC | C14AC
   | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC | 6C4G6C | 16C
Y5:  16C | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC
   | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC | 16C
Y6:  16C | C14AC | 6C4G6C | C14AC | C14AC | C14AC | C14AC | C14AC
   | C14AC | C14AC | C14AC | C14AC | C14AC | C14AC | 6C4G6C | 16C
Y7:  CACACACACACACACA | C14AC | C14AC | C14AC | 16A | 16A | 16A | 16A
   | 16A | 16A | 16A | 16A | C14AC | C14AC | C14AC | CACACACACACACACA
Y8:  4C8A4C | 4C8A4C | 4C8A4C | 4C8A4C | 8A8A | 8A8A | 8A8A | 8A8A
   | 8A8A | 8A8A | 8A8A | 8A8A | 4C8A4C | 4C8A4C | 4C8A4C | 4C8A4C
Y9:  4C8A4C | C2AC8AC2AC | C2AC8AC2AC | 4C8A4C | 16A | 16A | 16A | 16A
   | 16A | 16A | 16A | 16A | 4C8A4C | C2AC8AC2AC | C2AC8AC2AC | 4C8A4C
Y10: 4C8A4C | C2AC8AC2AC | C2AC8AC2AC | 4C8A4C | 16A | 16A | 16A | 16A
   | 16A | 16A | 16A | 16A | 4C8A4C | C2AC8AC2AC | C2AC8AC2AC | 4C8A4C
Y11: 4C8A4C | CGC1AC8ACGC | CGC1AC8ACGC | 4C8A4C | 16A | 16A | 16A | 16A
   | 16A | 16A | 16A | 16A | 4C8A4C | CGC1AC8ACGC | CGC1AC8ACGC | 4C8A4C
Y12: 4C8A4C | C2AC8AC2AC | C2AC8AC2AC | 4C8A4C | 16A | 16A | 16A | 16A
   | 16A | 16A | 16A | 16A | 4C8A4C | C2AC8AC2AC | C2AC8AC2AC | 4C8A4C
Y13: CACA8ACACA | 4C8A4C | 4C8A4C | CACA8ACACA | 16A | 16A | 16A | 16A
   | 16A | 16A | 16A | 16A | CACA8ACACA | 4C8A4C | 4C8A4C | CACA8ACACA
Y14: 4C8A4C | 4C8A4C | 4C8A4C | 4C8A4C | 16A | 16A | 16A | 16A
   | 16A | 16A | 16A | 16A | 4C8A4C | 4C8A4C | 4C8A4C | 4C8A4C
Y15: CRCC8ACCRC | 4C8A4C | 4C8A4C | CRCC8ACCRC | 16A | 16A | 16A | 16A
   | 16A | 16A | 16A | 16A | CRCC8ACCRC | 4C8A4C | 4C8A4C | CRCC8ACCRC
`

// ---------------------------------------------------------------------------
// PYRAMID — 20×20×11  Stepped Egyptian pyramid, sandstone, gold capstone.
// ---------------------------------------------------------------------------
const PYRAMID = `
Y0:  20H | 20H | 20H | 20H | 20H | 20H | 20H | 20H | 20H | 20H
   | 20H | 20H | 20H | 20H | 20H | 20H | 20H | 20H | 20H | 20H
Y1:  20H | 20H | 20H | 20H | 20H | 20H | 20H | 20H | 20H | 20H
   | 20H | 20H | 20H | 20H | 20H | 20H | 20H | 20H | 20H | 20H
Y2:  20A | 20A | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A
   | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A
   | 2A16H2A | 2A16H2A | 20A | 20A
Y3:  20A | 20A | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A
   | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A | 2A16H2A
   | 2A16H2A | 2A16H2A | 20A | 20A
Y4:  20A | 20A | 20A | 20A | 4A12H4A | 4A12H4A | 4A12H4A | 4A12H4A
   | 4A12H4A | 4A12H4A | 4A12H4A | 4A12H4A | 4A12H4A | 4A12H4A | 4A12H4A | 4A12H4A
   | 20A | 20A | 20A | 20A
Y5:  20A | 20A | 20A | 20A | 4A12H4A | 4A12H4A | 4A12H4A | 4A12H4A
   | 4A12H4A | 4A12H4A | 4A12H4A | 4A12H4A | 4A12H4A | 4A12H4A | 4A12H4A | 4A12H4A
   | 20A | 20A | 20A | 20A
Y6:  20A | 20A | 20A | 20A | 20A | 20A | 6A8H6A | 6A8H6A
   | 6A8H6A | 6A8H6A | 6A8H6A | 6A8H6A | 6A8H6A | 6A8H6A | 20A | 20A
   | 20A | 20A | 20A | 20A
Y7:  20A | 20A | 20A | 20A | 20A | 20A | 6A8H6A | 6A8H6A
   | 6A8H6A | 6A8H6A | 6A8H6A | 6A8H6A | 6A8H6A | 6A8H6A | 20A | 20A
   | 20A | 20A | 20A | 20A
Y8:  20A | 20A | 20A | 20A | 20A | 20A | 20A | 20A
   | 8A4H8A | 8A4H8A | 8A4H8A | 8A4H8A | 20A | 20A | 20A | 20A
   | 20A | 20A | 20A | 20A
Y9:  20A | 20A | 20A | 20A | 20A | 20A | 20A | 20A
   | 8A4H8A | 8A4H8A | 8A4H8A | 8A4H8A | 20A | 20A | 20A | 20A
   | 20A | 20A | 20A | 20A
Y10: 20A | 20A | 20A | 20A | 20A | 20A | 20A | 20A | 20A
   | 9A2Y9A | 9A2Y9A | 20A | 20A | 20A | 20A | 20A | 20A | 20A | 20A | 20A
`

// ---------------------------------------------------------------------------
// ROCKET — 9×9×27  Saturn-V-style rocket: iron pad, fins, quartz body
// with windows + red bands, tapered nose, tiny red flame tip.
// ---------------------------------------------------------------------------
const ROCKET = `
Y0:  9I | 9I | 9I | 9I | 9I | 9I | 9I | 9I | 9I
Y1:  4AR4A | 4AR4A | 2A5I2A | 2A5I2A | 2R5I2R | 2A5I2A | 2A5I2A | 4AR4A | 4AR4A
Y2:  9A | 9A | 2A5I2A | 2A5I2A | 2A5I2A | 2A5I2A | 2A5I2A | 9A | 9A
Y3:  9A | 9A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 9A | 9A
Y4:  9A | 9A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 9A | 9A
Y5:  9A | 9A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 9A | 9A
Y6:  9A | 9A | 2A5R2A | 2A5R2A | 2A5R2A | 2A5R2A | 2A5R2A | 9A | 9A
Y7:  9A | 9A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 9A | 9A
Y8:  9A | 9A | 2AQQGQQ2A | 2A5Q2A | 2AGQQQG2A | 2A5Q2A | 2AQQGQQ2A | 9A | 9A
Y9:  9A | 9A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 9A | 9A
Y10: 9A | 9A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 9A | 9A
Y11: 9A | 9A | 2A5R2A | 2A5R2A | 2A5R2A | 2A5R2A | 2A5R2A | 9A | 9A
Y12: 9A | 9A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 9A | 9A
Y13: 9A | 9A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 9A | 9A
Y14: 9A | 9A | 2AQQGQQ2A | 2A5Q2A | 2AGQQQG2A | 2A5Q2A | 2AQQGQQ2A | 9A | 9A
Y15: 9A | 9A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 9A | 9A
Y16: 9A | 9A | 2A5R2A | 2A5R2A | 2A5R2A | 2A5R2A | 2A5R2A | 9A | 9A
Y17: 9A | 9A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 9A | 9A
Y18: 9A | 9A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 9A | 9A
Y19: 9A | 9A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 2A5Q2A | 9A | 9A
Y20: 9A | 9A | 9A | 3A3Q3A | 3A3Q3A | 3A3Q3A | 9A | 9A | 9A
Y21: 9A | 9A | 9A | 3A3Q3A | 3A3Q3A | 3A3Q3A | 9A | 9A | 9A
Y22: 9A | 9A | 9A | 3A3Q3A | 3A3Q3A | 3A3Q3A | 9A | 9A | 9A
Y23: 9A | 9A | 9A | 9A | 4AY4A | 9A | 9A | 9A | 9A
Y24: 9A | 9A | 9A | 9A | 4AY4A | 9A | 9A | 9A | 9A
Y25: 9A | 9A | 9A | 9A | 4AR4A | 9A | 9A | 9A | 9A
Y26: 9A | 9A | 9A | 9A | 4AR4A | 9A | 9A | 9A | 9A
`

// ---------------------------------------------------------------------------
// LIGHTHOUSE — 7×7×24  Stone base, alternating red/white bands, gallery
// railing, glass lantern room with sea-lantern light, stepped roof point.
// ---------------------------------------------------------------------------
const LIGHTHOUSE = `
Y0:  7S | 7S | 7S | 7S | 7S | 7S | 7S
Y1:  7S | 7S | 7S | 7S | 7S | 7S | 7S
Y2:  7A | A5SA | A5SA | A5SA | A5SA | A5SA | 7A
Y3:  7A | A5RA | A5RA | A5RA | A5RA | A5RA | 7A
Y4:  7A | A5RA | A5RA | A5RA | A5RA | A5RA | 7A
Y5:  7A | A5RA | A5RA | A5RA | A5RA | A5RA | 7A
Y6:  7A | A5QA | A5QA | A5QA | A5QA | A5QA | 7A
Y7:  7A | A5QA | A5QA | A5QA | A5QA | A5QA | 7A
Y8:  7A | A5QA | A5QA | A5QA | A5QA | A5QA | 7A
Y9:  7A | A5RA | A5RA | A5RA | A5RA | A5RA | 7A
Y10: 7A | A5RA | A5RA | A5RA | A5RA | A5RA | 7A
Y11: 7A | A5RA | A5RA | A5RA | A5RA | A5RA | 7A
Y12: 7A | A5QA | A5QA | A5QA | A5QA | A5QA | 7A
Y13: 7A | A5QA | A5QA | A5QA | A5QA | A5QA | 7A
Y14: 7A | A5QA | A5QA | A5QA | A5QA | A5QA | 7A
Y15: 7S | 7S | 7S | 7S | 7S | 7S | 7S
Y16: 7S | S5AS | S5AS | S5AS | S5AS | S5AS | 7S
Y17: 7A | A5GA | A5GA | A5GA | A5GA | A5GA | 7A
Y18: 7A | A5GA | A5GA | AG3UGA | A5GA | A5GA | 7A
Y19: 7A | A5GA | A5GA | A5GA | A5GA | A5GA | 7A
Y20: 7R | 7R | 7R | 7R | 7R | 7R | 7R
Y21: 7A | A5RA | A5RA | A5RA | A5RA | A5RA | 7A
Y22: 7A | 7A | 2A3R2A | 2A3R2A | 2A3R2A | 7A | 7A
Y23: 7A | 7A | 7A | 3AR3A | 7A | 7A | 7A
`

// ---------------------------------------------------------------------------
// SKYSCRAPER — 12×12×25  Iron-framed glass tower, full floor plate every
// 4 levels, tapered profile (12→10→8→6→4→2), red spire on top.
// ---------------------------------------------------------------------------
const SKYSCRAPER = `
Y0:  12I | 12I | 12I | 12I | 12I | 12I | 12I | 12I | 12I | 12I | 12I | 12I
Y1:  I10GI | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | I10GI
Y2:  I10GI | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | I10GI
Y3:  I10GI | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | G10AG | I10GI
Y4:  12I | 12I | 12I | 12I | 12I | 12I | 12I | 12I | 12I | 12I | 12I | 12I
Y5:  12A | AI8GIA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AI8GIA | 12A
Y6:  12A | AI8GIA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AI8GIA | 12A
Y7:  12A | AI8GIA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AG8AGA | AI8GIA | 12A
Y8:  12A | A10IA | A10IA | A10IA | A10IA | A10IA | A10IA | A10IA | A10IA | A10IA | A10IA | 12A
Y9:  12A | 12A | 2AI6GI2A | 2AG6AG2A | 2AG6AG2A | 2AG6AG2A | 2AG6AG2A | 2AG6AG2A | 2AG6AG2A | 2AI6GI2A | 12A | 12A
Y10: 12A | 12A | 2AI6GI2A | 2AG6AG2A | 2AG6AG2A | 2AG6AG2A | 2AG6AG2A | 2AG6AG2A | 2AG6AG2A | 2AI6GI2A | 12A | 12A
Y11: 12A | 12A | 2AI6GI2A | 2AG6AG2A | 2AG6AG2A | 2AG6AG2A | 2AG6AG2A | 2AG6AG2A | 2AG6AG2A | 2AI6GI2A | 12A | 12A
Y12: 12A | 12A | 2A8I2A | 2A8I2A | 2A8I2A | 2A8I2A | 2A8I2A | 2A8I2A | 2A8I2A | 2A8I2A | 12A | 12A
Y13: 12A | 12A | 12A | 3AI4GI3A | 3AG4AG3A | 3AG4AG3A | 3AG4AG3A | 3AG4AG3A | 3AI4GI3A | 12A | 12A | 12A
Y14: 12A | 12A | 12A | 3AI4GI3A | 3AG4AG3A | 3AG4AG3A | 3AG4AG3A | 3AG4AG3A | 3AI4GI3A | 12A | 12A | 12A
Y15: 12A | 12A | 12A | 3AI4GI3A | 3AG4AG3A | 3AG4AG3A | 3AG4AG3A | 3AG4AG3A | 3AI4GI3A | 12A | 12A | 12A
Y16: 12A | 12A | 12A | 3A6I3A | 3A6I3A | 3A6I3A | 3A6I3A | 3A6I3A | 3A6I3A | 12A | 12A | 12A
Y17: 12A | 12A | 12A | 12A | 4AI2GI4A | 4AG2AG4A | 4AG2AG4A | 4AI2GI4A | 12A | 12A | 12A | 12A
Y18: 12A | 12A | 12A | 12A | 4AI2GI4A | 4AG2AG4A | 4AG2AG4A | 4AI2GI4A | 12A | 12A | 12A | 12A
Y19: 12A | 12A | 12A | 12A | 4AI2GI4A | 4AG2AG4A | 4AG2AG4A | 4AI2GI4A | 12A | 12A | 12A | 12A
Y20: 12A | 12A | 12A | 12A | 4A4I4A | 4A4I4A | 4A4I4A | 4A4I4A | 12A | 12A | 12A | 12A
Y21: 12A | 12A | 12A | 12A | 12A | 5A2I5A | 5A2I5A | 12A | 12A | 12A | 12A | 12A
Y22: 12A | 12A | 12A | 12A | 12A | 5A2R5A | 5A2R5A | 12A | 12A | 12A | 12A | 12A
Y23: 12A | 12A | 12A | 12A | 12A | 5AR6A | 12A | 12A | 12A | 12A | 12A | 12A
Y24: 12A | 12A | 12A | 12A | 12A | 5AR6A | 12A | 12A | 12A | 12A | 12A | 12A
`

// ---------------------------------------------------------------------------
// PIRATE_SHIP — 15×7×14  Wooden hull with raised bow/stern, deck planks,
// central mast (oak log), white square sail, red pirate flag on top.
// ---------------------------------------------------------------------------
const PIRATE_SHIP = `
Y0:  15D | 15D | 15D | 15D | 15D | 15D | 15D
Y1:  15D | D13AD | D13AD | D13AD | D13AD | D13AD | 15D
Y2:  15D | D13AD | D13AD | D13AD | D13AD | D13AD | 15D
Y3:  15W | 15W | 15W | 15W | 15W | 15W | 15W
Y4:  15D | D13AD | D13AD | D13AD | D13AD | D13AD | 15D
Y5:  15D | D13AD | D13AD | D13AD | D13AD | D13AD | 15D
Y6:  15A | 15A | 15A | 7AF7A | 15A | 15A | 15A
Y7:  15A | 15A | 15A | 3A4QF4Q3A | 15A | 15A | 15A
Y8:  15A | 15A | 15A | 3A4QF4Q3A | 15A | 15A | 15A
Y9:  15A | 15A | 15A | 3A4QF4Q3A | 15A | 15A | 15A
Y10: 15A | 15A | 15A | 7AF7A | 15A | 15A | 15A
Y11: 15A | 15A | 6A3W6A | 6AWFW6A | 6A3W6A | 15A | 15A
Y12: 15A | 15A | 15A | 7AF7A | 15A | 15A | 15A
Y13: 15A | 15A | 15A | 7AR7A | 15A | 15A | 15A
`

// ===========================================================================
// MAP STARTERS — minimal worlds for survival challenges.  Sized so the 5×5
// (or 7×7) island sits centred on the fixed spawn at world (10, baseY+1, 10).
// ===========================================================================

// ---------------------------------------------------------------------------
// SKYBLOCK — classic floating dirt/grass island (5×5) with an oak tree at
// one corner and a starter chest on the opposite corner.  Player spawns on
// top of the grass at the centre.
// ---------------------------------------------------------------------------
const SKYBLOCK = `
Y0:  13A | 13A | 13A | 13A | 13A | 13A | 13A | 13A
   | 8A5g | 8A5g | 8A5g | 8A5g | 8A5g
Y1:  13A | 13A | 13A | 13A | 13A | 13A | 13A | 13A
   | 8AF4A | 13A | 13A | 13A | 12Ac
Y2:  13A | 13A | 13A | 13A | 13A | 13A | 13A | 13A
   | 8AF4A | 13A | 13A | 13A | 13A
Y3:  13A | 13A | 13A | 13A | 13A | 13A
   | 6A5l2A | 6A5l2A | 6A2lF2l2A | 6A5l2A | 6A5l2A | 13A | 13A
Y4:  13A | 13A | 13A | 13A | 13A | 13A
   | 6A5l2A | 6A5l2A | 6A2lF2l2A | 6A5l2A | 6A5l2A | 13A | 13A
Y5:  13A | 13A | 13A | 13A | 13A | 13A | 13A
   | 7A3l3A | 7AlFl3A | 7A3l3A | 13A | 13A | 13A
Y6:  13A | 13A | 13A | 13A | 13A | 13A | 13A | 13A
   | 8Al4A | 13A | 13A | 13A | 13A
`

// ---------------------------------------------------------------------------
// VOID_PLATFORM — a single 5×5 obsidian pad floating in the void.  Bring
// your own blocks.  Good for creative / build servers.
// ---------------------------------------------------------------------------
const VOID_PLATFORM = `
Y0:  13A | 13A | 13A | 13A | 13A | 13A | 13A | 13A
   | 8A5O | 8A5O | 8A5O | 8A5O | 8A5O
`

// ---------------------------------------------------------------------------
// ONE_BLOCK — a single stone block at spawn.  Mine it.  See what happens.
// (The auto spawn-platform safety covers the same cell, so this is mostly
// a demonstration of the smallest possible template.)
// ---------------------------------------------------------------------------
const ONE_BLOCK = `
Y0:  11A | 11A | 11A | 11A | 11A | 11A | 11A | 11A | 11A | 11A | 10AS
`

// ---------------------------------------------------------------------------
// Registry — keys are normalised to lowercase by `resolveTemplate`.
// ---------------------------------------------------------------------------
export const TEMPLATE_EXAMPLES: Record<string, string> = {
  // Cool builds
  castle: CASTLE,
  pyramid: PYRAMID,
  rocket: ROCKET,
  lighthouse: LIGHTHOUSE,
  skyscraper: SKYSCRAPER,
  pirate_ship: PIRATE_SHIP,
  // Map starters
  skyblock: SKYBLOCK,
  void_platform: VOID_PLATFORM,
  one_block: ONE_BLOCK,
}

/**
 * If `templateStr` is exactly `[name]` (whitespace tolerated), return the
 * matching built-in example; otherwise return `templateStr` unchanged.
 *
 * Throws when the example name is not registered.
 */
export function resolveTemplate(templateStr: string): string {
  const m = templateStr.match(/^\s*\[([\w-]+)\]\s*$/)
  if (!m) return templateStr

  const name = m[1]!.toLowerCase()
  const example = TEMPLATE_EXAMPLES[name]
  if (!example) {
    throw new Error(
      `[chunkTemplate] Unknown example '${name}'. ` +
      `Available: ${Object.keys(TEMPLATE_EXAMPLES).join(', ')}`,
    )
  }
  return example
}
