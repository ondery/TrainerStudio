# Licensing

## Core

The application core, the web interface, and the public plugin host are licensed under the GNU Affero General Public License v3.0. The text is in [LICENSE](LICENSE). If you run a modified version as a network service, the AGPL requires you to offer the corresponding source to users of that service.

## Ultralytics

The optional YOLO and SAM backends import Ultralytics, which is AGPL-3.0. Installing `requirements-ai.txt` and shipping those backends means the AGPL obligations apply to that combination. The core does not import Ultralytics until a job or a SAM request asks for it. Tests assert that importing the API does not import Ultralytics.

## RT-DETR

`trainer_studio/detectors/rtdetr.py` talks to Hugging Face Transformers. RT-DETR weights and the Transformers library are Apache-2.0. This backend does not import Ultralytics. Predictions whose class names are not in `data.yaml` are skipped, so a COCO model cannot write a foreign class index into your labels.

## Enterprise

`ee/` is source-available under [ee/LICENSE](ee/LICENSE), following the split used by GitLab, Cal.com, and Label Studio: one core license, a separate commercial license for the paid package. A missing, invalid, or expired key locks those routes. The core does not consult the key to open, label, save, or export.

Keys are Ed25519. The public key is embedded. The signer that holds the private key lives outside this repository and must not be copied into a published tree.

## Plugins

Public plugins that ship with the core stay under the AGPL. A private plugin kept outside this tree is not published with the core, the Docker image, or the public release archive. The public-tree check fails the build if that private code is copied into this folder.

## Telemetry

None is sent by default. Health and job routes stay on the machine that runs the server.

## Contributions

See [CONTRIBUTING.md](CONTRIBUTING.md). A contributor license agreement is required so the core can stay AGPL and `ee/` can stay under the Enterprise license.
