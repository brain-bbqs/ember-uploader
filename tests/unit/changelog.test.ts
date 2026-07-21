import { describe, expect, it } from "vitest";
import { renderChangelogHtml } from "../../src/lib/changelog";

const CHANGELOG = `# Changelog

## 0.0.3

#### 🚀 Enhancement

- Added \`thing\` ([#3](https://github.com/brain-bbqs/ember-uploader/pull/3))

## 0.0.2

#### 🐛 Bug Fix

- Fixed **something** ([#2](https://github.com/brain-bbqs/ember-uploader/pull/2))

## 0.0.1

#### 🏠 Internal

- Initial commit
`;

describe("renderChangelogHtml", () => {
  it("renders only the latest N version sections", () => {
    const html = renderChangelogHtml(CHANGELOG, 2);
    expect(html).toContain("0.0.3");
    expect(html).toContain("0.0.2");
    expect(html).not.toContain("0.0.1");
  });

  it("defaults to the latest 3 versions", () => {
    const html = renderChangelogHtml(CHANGELOG);
    expect(html).toContain("0.0.3");
    expect(html).toContain("0.0.2");
    expect(html).toContain("0.0.1");
  });

  it("renders subsection headings and list items", () => {
    const html = renderChangelogHtml(CHANGELOG, 1);
    expect(html).toContain("<h3>0.0.3</h3>");
    expect(html).toContain("<h4>🚀 Enhancement</h4>");
    expect(html).toContain("<li>");
  });

  it("renders inline code, bold, and links", () => {
    const html = renderChangelogHtml(CHANGELOG, 2);
    expect(html).toContain("<code>thing</code>");
    expect(html).toContain("<strong>something</strong>");
    expect(html).toContain('<a href="https://github.com/brain-bbqs/ember-uploader/pull/3"');
  });

  it("escapes HTML in the source text", () => {
    const html = renderChangelogHtml("## 0.0.1\n\n- <script>alert(1)</script>\n", 1);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
