import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fallbackLocale } from "../../../app/i18n";
import type { ProjectRecord } from "../projectsApi";
import { ProjectRowActions } from "./ProjectsPage";

const project: ProjectRecord = {
  id: "project-skills-manager",
  name: "Skills Manager",
  path: "D:\\Development\\nodejs\\SkillsManager",
  createdAt: "2026-05-20T08:00:00.000Z",
  updatedAt: "2026-05-20T09:00:00.000Z"
};

describe("ProjectRowActions", () => {
  test("renders both open-detail and delete actions", () => {
    const markup = renderToStaticMarkup(
      <ProjectRowActions
        catalog={fallbackLocale}
        language="en"
        onDelete={() => undefined}
        onOpen={() => undefined}
        project={project}
      />
    );

    expect(markup).toContain("Open Project");
    expect(markup).toContain("Delete Skills Manager");
  });

  test("uses the notebook-edit icon for the project detail action", () => {
    const markup = renderToStaticMarkup(
      <ProjectRowActions
        catalog={fallbackLocale}
        language="en"
        onDelete={() => undefined}
        onOpen={() => undefined}
        project={project}
      />
    );

    expect(markup).toContain(
      "M232.49,55.51l-32-32a12,12,0,0,0-17,0l-96,96A12,12,0,0,0,84,128v32"
    );
    expect(markup).not.toContain(
      "M228,104a12,12,0,0,1-24,0V69l-59.51,59.51a12,12,0,0,1-17-17L187,52H152"
    );
  });
});
