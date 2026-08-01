import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { MessageMarkdown, SearchToolChip } from "./routes/chat.$conversationId";

describe("Conversation dialogue", () => {
  it("renders search sources as links", () => {
    const markup = renderToStaticMarkup(
      <SearchToolChip
        output={{
          results: [
            {
              title: "Roshi release notes",
              url: "https://example.com/releases",
              snippet: "The current release is 1.2.3.",
            },
          ],
        }}
      />,
    );

    expect(markup).toContain("Web search");
    expect(markup).toContain('href="https://example.com/releases"');
    expect(markup).toContain("Roshi release notes");
  });

  it("renders inline Markdown citations as links", () => {
    const markup = renderToStaticMarkup(
      <MessageMarkdown text="The current release is 1.2.3. [Release notes](https://example.com/releases)" />,
    );

    expect(markup).toContain('href="https://example.com/releases"');
    expect(markup).toContain("Release notes");
  });
});
