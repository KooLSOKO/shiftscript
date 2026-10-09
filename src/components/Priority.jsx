import { Flag } from "./Icons.jsx";
export default function Priority({ value }) {
  return (
    <span className={"priority " + value.toLowerCase()}>
      <Flag size={12} />
      {value === "Med" ? "Medium" : value}
    </span>
  );
}
