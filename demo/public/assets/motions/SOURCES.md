# Reference motion sources and processing

The reference motions are used to demonstrate NEXUS in a browser. NEXUS
processes source recordings into Unitree G1 reference trajectories; these
files are not unmodified human-motion recordings.

## Original sources and terms

- **LAFAN1**, Ubisoft La Forge. Dataset and accompanying publication:
  [Robust Motion In-Betweening](https://github.com/ubisoft/ubisoft-laforge-animation-dataset),
  Félix G. Harvey, Mike Yurick, Derek Nowrouzezahrai, and Christopher Pal,
  ACM Transactions on Graphics / SIGGRAPH 2020.
  Original terms: **CC BY-NC-ND 4.0**. The upstream license is retained
  without changes in [LAFAN1_LICENSE.txt](LAFAN1_LICENSE.txt).
- **AMASS**, Max Planck Institute for Intelligent Systems and the contributing
  motion-capture datasets. Publication:
  [AMASS: Archive of Motion Capture as Surface Shapes](https://amass.is.tue.mpg.de/),
  Naureen Mahmood, Nima Ghorbani, Nikolaus F. Troje, Gerard Pons-Moll, and
  Michael J. Black, ICCV 2019. Original terms:
  [AMASS dataset license](https://amass.is.tue.mpg.de/license.html).
  Verified source recordings below include **ACCAD** and **KIT**.

These source terms are not replaced by the website's MIT license. No additional
reuse, redistribution, commercial-use, or sublicensing permission for motion
data is granted by this website. Source attribution and the description of our
processing do not override the original terms or establish additional permission
from the original rights holders. The source materials remain subject to their
original warranties, disclaimers, and restrictions. No endorsement is implied.

## Processing

NEXUS processing includes G1 retargeting and preparation of 50 Hz reference
trajectories. Selected clips are cropped, and some are reflected left/right.
The browser export selects the 29 configured joint angles, root position, and
root orientation, normalizes the starting horizontal root position, and writes
JSON arrays using WXYZ quaternions. The CSV example is another representation
of the same front-kick excerpt, with the same source terms.

The browser downloads reference arrays to run the interactive simulation.
Absence of a separate download button does not change how these assets are
delivered.

## Verified recording examples

The following mappings have been checked against local export records and,
for the listed LAFAN1 ranges, the corresponding G1 joint trajectories.
Frame ranges refer to the processed **50 Hz** recording, with an exclusive
end frame; they are not frame indices into the original 30 Hz BVH recordings.
This is a verified subset, not a complete provenance inventory for every
built-in motion. Unlisted recordings are not assumed to have either license
based only on their filenames.

| Browser asset                             | Original recording                                  | Processed excerpt / changes           |
| ----------------------------------------- | --------------------------------------------------- | ------------------------------------- |
| `back_walk`                               | LAFAN1 `walk1_subject1`                             | Frames 2003:2203                      |
| `run1_subject2_1500_1800`                 | LAFAN1 `run1_subject2`                              | Frames 1500:1800                      |
| `run1_subject5_250_550`                   | LAFAN1 `run1_subject5`                              | Frames 250:550                        |
| `fight1_subject5_500_800`                 | LAFAN1 `fight1_subject5`                            | Frames 500:800                        |
| `dance1_subject2`                         | LAFAN1 `dance1_subject2`                            | Full local processed recording        |
| `dance1_subject3`                         | LAFAN1 `dance1_subject3`                            | Full local processed recording        |
| `single_leg_balance`                      | LAFAN1 `fightAndSports1_subject1`                   | Frames 100:450                        |
| `front_kick`, `../front-kick-example.csv` | LAFAN1 `fightAndSports1_subject1`                   | Frames 1000:1300                      |
| `side_walk_left`                          | AMASS / ACCAD / Female1Walking / B22 side step left | Local processed recording             |
| `side_walk_right`                         | Same ACCAD recording                                | Left/right reflection                 |
| `squat`                                   | AMASS / KIT / 3 / squat03                           | Local processed recording             |
| `kneel_right`                             | AMASS / KIT / 3 / kneel_down_with_left_hand02       | Frames 250:440                        |
| `kneel_left`                              | Same KIT recording                                  | Frames 250:440, left/right reflection |
| `kneel_both`                              | AMASS / KIT / 3 / kneel_down_with_right_hand01      | Local processed recording             |

For provenance questions or a rights-holder correction request, contact
thedarkknight@sjtu.edu.cn.
