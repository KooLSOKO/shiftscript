import { useState } from "react";
import { Plus, MessageSquare, Trash, Search } from "./Icons.jsx";

export default function ShiftyHistory({
  chats,
  chatId,
  disabled,
  onSelect,
  onNew,
  onDelete,
}) {
  const [search, setSearch] = useState("");
  const filtered = chats.filter((chat) =>
    chat.title.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()),
  );
  return (
    <div className="shifty-history-content">
      <button
        className="button primary shifty-history-new"
        disabled={disabled}
        onClick={onNew}
      >
        <Plus size={20} />
        New chat
      </button>
      <label className="shifty-history-search">
        <Search size={18} />
        <span className="sr-only">Search previous chats</span>
        <input
          type="search"
          placeholder="Search chats"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <p className="shifty-history-private">
        Only you can see these chats in this workspace.
      </p>
      <div className="shifty-history-list" aria-label="Saved Shifty chats">
        {filtered.map((chat) => (
          <div
            className={
              "shifty-history-row" + (chat.id === chatId ? " selected" : "")
            }
            key={chat.id}
            data-chat-id={chat.id}
          >
            <button
              className="shifty-history-select"
              title={chat.title}
              disabled={disabled}
              aria-current={chat.id === chatId ? "page" : undefined}
              onClick={() => onSelect(chat)}
            >
              <MessageSquare size={18} />
              <span>
                <strong>{chat.title}</strong>
                <small>
                  {new Date(chat.updatedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {Math.floor(chat.messageCount / 2)}{" "}
                  {chat.messageCount === 2 ? "reply" : "replies"}
                </small>
              </span>
            </button>
            <button
              className="icon-button"
              aria-label={"Delete chat: " + chat.title}
              disabled={disabled}
              onClick={() => onDelete(chat)}
            >
              <Trash size={17} />
            </button>
          </div>
        ))}
        {!filtered.length && (
          <p className="hint">
            {chats.length
              ? "No matching chats."
              : "Your conversations will appear here after Shifty replies."}
          </p>
        )}
      </div>
    </div>
  );
}
