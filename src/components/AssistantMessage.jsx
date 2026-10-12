import { inlineMessage, messageBlocks } from "../features/message-format.js";

function Inline({ text }) {
  return inlineMessage(text).map((part, index) =>
    part.type === "text" ? (
      part.text
    ) : part.type === "strong" ? (
      <strong key={index}>{part.text}</strong>
    ) : part.type === "em" ? (
      <em key={index}>{part.text}</em>
    ) : (
      <code key={index}>{part.text}</code>
    ),
  );
}
export default function AssistantMessage({ text }) {
  return (
    <div className="assistant-message-text assistant-rich-text">
      {messageBlocks(text).map((block, index) => {
        if (block.type === "heading")
          return (
            <h4 key={index}>
              <Inline text={block.text} />
            </h4>
          );
        if (block.type === "paragraph")
          return (
            <p key={index}>
              <Inline text={block.text} />
            </p>
          );
        const List = block.ordered ? "ol" : "ul";
        return (
          <List key={index} start={block.ordered ? block.start : undefined}>
            {block.items.map((item, i) => (
              <li key={i}>
                <Inline text={item.text} />
                {item.details.length > 0 && (
                  <ul>
                    {item.details.map((detail, j) => (
                      <li key={j}>
                        <Inline text={detail} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
