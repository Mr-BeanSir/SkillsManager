import { describe, expect, test } from "vitest";
import {
  buildAttachmentSelectionItems,
  collectPendingAttachmentIds
} from "./projectDetailSelectionModel";

describe("projectDetailSelectionModel", () => {
  test("marks existing attachments as checked and disabled in the modal list", () => {
    const items = buildAttachmentSelectionItems(
      [
        { id: "skill-one", name: "grill-with-docs" },
        { id: "skill-two", name: "find-skills" },
        { id: "skill-three", name: "systematic-debugging" }
      ],
      ["skill-one", "skill-three"]
    );

    expect(items).toEqual([
      {
        id: "skill-one",
        label: "grill-with-docs",
        checked: true,
        disabled: true
      },
      {
        id: "skill-two",
        label: "find-skills",
        checked: false,
        disabled: false
      },
      {
        id: "skill-three",
        label: "systematic-debugging",
        checked: true,
        disabled: true
      }
    ]);
  });

  test("keeps only new attachment ids when submitting a modal selection", () => {
    const pendingIds = collectPendingAttachmentIds(
      ["skill-three", "skill-two", "skill-one", "skill-two"],
      ["skill-one", "skill-three"]
    );

    expect(pendingIds).toEqual(["skill-two"]);
  });
});
