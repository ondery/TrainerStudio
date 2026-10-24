# Trainer Studio FAQ

Short answers to the questions people ask before installing the open core. The same topics are summarized in the [README](../README.md).

## Is Trainer Studio free?

Yes. The open core is AGPL-3.0. You can run it locally at no charge. If you serve the program to users over a network, the AGPL requires you to offer them the corresponding source. A commercial add-on exists for team features. This repository does not list prices. Contact the author.

## Does it work offline?

Yes. Labeling, class edits, saving, and export talk only to the Trainer Studio process on your computer. There is no account. Downloading optional SAM or training weights is the step that uses the network, and only when you ask for those weights.

## Which formats does it support?

Opened datasets are Ultralytics YOLO: `data.yaml` and label text for detect, segment, oriented boxes, or pose. Export can write a new folder as YOLO, COCO JSON, or Pascal VOC XML.

## How do I export to YOLO?

Saving an image writes `labels/<name>.txt` with class indexes taken from `data.yaml` at that moment. Export (Ctrl+E) writes a separate YOLO copy to a folder you choose. The copy can be grouped into train, val, and test. The dataset you have open is not rewritten by that export.

## How is it different from LabelImg?

LabelImg is a MIT-licensed desktop tool for bounding boxes and YOLO detection text. Trainer Studio adds polygons, a dockable browser workspace, a class manager, 12 languages, and YOLO segment, oriented-box, and pose files, and it is AGPL-3.0. Both are local, single-computer annotators.

## Does it need a GPU?

No. Boxes, polygons, and export do not use a GPU. Optional SAM and training can use CUDA when PyTorch provides it, and they can run on CPU. A shared GPU queue is part of the commercial add-on.

## Which operating systems are supported?

Windows, macOS, and Linux, with Python 3.11 or newer. Rebuilding the web interface needs Node.js 22. Running a release that already contains `static/` does not.

## Can several people label together?

Not in the open core. It is one person on one machine. Roles, single sign-on, and review assignment are available in the commercial add-on. Contact the author.

## Where are images and labels stored?

In the dataset directory you opened. The SQLite file for projects and undo lives in the app data directory (`STUDIO_DATA_DIR` or `STUDIO_DATA`, otherwise `data/` next to the program). The open core does not upload either folder.

## Why does a folder open return 403?

The page and the API share a session token from `/api/health`. Use the browser tab that Trainer Studio opened. Paths outside the data directory need a grant from the folder dialog. The generic file API also refuses to write an opened dataset's `labels/` files or `data.yaml`. Use Save or Export for those.

## Which languages are included?

English (the default on a fresh profile), Turkish, German, Spanish, French, Italian, Brazilian Portuguese, Russian, Arabic, Japanese, Korean, and Simplified Chinese. A saved language choice overrides the default.
