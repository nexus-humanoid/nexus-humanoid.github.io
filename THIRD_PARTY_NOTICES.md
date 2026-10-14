# Third-party notices

## Font Awesome Free 7.3.1

The YouTube, Envelope and Weixin SVG icons embedded in `index.html` are from
[Font Awesome Free](https://fontawesome.com/) by Fonticons, Inc.

- Source: [Font Awesome 7.3.1](https://github.com/FortAwesome/Font-Awesome/tree/7.3.1).
- Icons license: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
- Upstream licensing: [Font Awesome Free license](https://github.com/FortAwesome/Font-Awesome/blob/7.3.1/LICENSE.txt).

The SVG paths are embedded inline, with presentation and accessibility
attributes supplied by this website. Existing attribution comments are retained
in the HTML. These icons are excluded from the website's MIT license and remain
under CC BY 4.0. Preserve their attribution and applicable license when reusing them.

Brand names and logos belong to their respective owners. Their appearance does
not imply endorsement of NEXUS or of any derivative website.

## Interactive demo runtime

The interactive demo bundles these dependencies:

- Three.js 0.180.0 (MIT): [license](demo/vendor/three/LICENSE),
  [upstream](https://github.com/mrdoob/three.js/tree/r180).
- MuJoCo 3.13.0 (Apache-2.0), by Google DeepMind:
  [license](demo/vendor/@mujoco/mujoco/LICENSE),
  [upstream](https://github.com/google-deepmind/mujoco/tree/3.13.0).
- ONNX Runtime Web 1.22.0 (MIT), Copyright (c) Microsoft Corporation:
  [license](demo/vendor/onnxruntime-web/LICENSE),
  [upstream third-party notices](demo/vendor/onnxruntime-web/ThirdPartyNotices.txt),
  [upstream](https://github.com/microsoft/onnxruntime/tree/v1.22.0).

Bundled copyright comments are retained. The ONNX Runtime notice file is the
complete upstream notice collection; not every component listed there is used
by the Web build. These dependencies retain their upstream licenses and are
excluded from this website's MIT grant.

## Unitree G1 robot resources

The G1 mesh files in `demo/public/assets/meshes/` originate from
[Unitree ROS](https://github.com/unitreerobotics/unitree_ros/tree/5994d4faef0a9cadd3287f8de0199a67eeb2a259/robots/g1_description)
by Unitree Robotics, under BSD-3-Clause. The full copyright notice, conditions,
and disclaimer are retained in [UNITREE_LICENSE.txt](demo/public/assets/UNITREE_LICENSE.txt).
The robot description `demo/public/assets/g1.xml` is the NEXUS-adapted model,
with project-specific actuator, contact, and calibrated depth-camera settings.
It is not an unmodified copy of an upstream XML. Its source chain passes through
our deployment implementation, which references
[motion_tracking](https://github.com/Axellwppr/motion_tracking/tree/0d5ba31e33397f3543d350d98b637e26d92f470a).
The corresponding MIT notice, Copyright (c) 2026 Axell, is retained in
[ROBOT_DESCRIPTION_LICENSE.txt](demo/public/assets/ROBOT_DESCRIPTION_LICENSE.txt)
for incorporated upstream material. This notice does not attribute all NEXUS
modifications to that upstream author or relicense the Unitree meshes.
Our website license does not relicense these robot resources or grant rights
to Unitree trademarks, and their inclusion does not imply endorsement.

## Motion recordings

Some bundled reference motions are retargeted excerpts from
[LAFAN1](https://github.com/ubisoft/ubisoft-laforge-animation-dataset), by Ubisoft
La Forge, and [AMASS](https://amass.is.tue.mpg.de/), by the Max Planck Institute
for Intelligent Systems and the contributing motion-capture datasets.
Retargeting, cropping, reflection, and coordinate normalization have been
applied to selected recordings; they are not unmodified upstream data.

Original source terms are retained rather than replaced with the website's
MIT license: LAFAN1 uses
[CC BY-NC-ND 4.0](demo/public/assets/motions/LAFAN1_LICENSE.txt), while AMASS
has its own [dataset terms](https://amass.is.tue.mpg.de/license.html).
See [motion sources and processing](demo/public/assets/motions/SOURCES.md)
for publication credits, verified recording examples, and the applied changes.
No additional reuse or redistribution permission for motion data is granted
by this website. These notices do not waive upstream conditions or establish
additional authorization from the original rights holders.

Research text, figures, videos, robot assets, motion clips, and
model weights remain subject to the project-content exclusions in
`LICENSE_SCOPE.md`.
