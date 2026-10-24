"""Next and previous image inside the visible filtered list."""

from __future__ import annotations


def next_id(ordered_ids: list[str], current_id: str, anchor_index: int, direction: int) -> str | None:
    """Step in ``direction`` (+1 or -1).

    When ``current_id`` is still in the list, step from its current place.
    When it dropped out after labeling, continue from the slot it used to occupy.
    ``anchor_index`` is that slot in the list from the moment the image was opened.
    """
    if direction not in {1, -1}:
        raise ValueError("direction")
    if current_id in ordered_ids:
        index = ordered_ids.index(current_id) + direction
        if 0 <= index < len(ordered_ids):
            return ordered_ids[index]
        return None
    if direction > 0:
        if 0 <= anchor_index < len(ordered_ids):
            return ordered_ids[anchor_index]
        return None
    index = anchor_index - 1
    if 0 <= index < len(ordered_ids):
        return ordered_ids[index]
    return None
