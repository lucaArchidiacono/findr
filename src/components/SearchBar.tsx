import type { FC } from "react";

interface SearchBarProps {
  value: string;
  placeholder?: string;
  isLoading: boolean;
  focused: boolean;
  onChange(value: string): void;
  onSubmit(): void;
}

export const SearchBar: FC<SearchBarProps> = ({
  value,
  placeholder = "Search the web or type :command",
  isLoading,
  focused,
  onChange,
  onSubmit,
}) => {
  const handleInput = (nextValue: unknown) => {
    onChange(String(nextValue ?? ""));
  };

  const handleSubmit = () => {
    onSubmit();
  };

  return (
    <box
      flexDirection="row"
      alignItems="center"
      borderStyle="round"
      borderColor="#555555"
      paddingLeft={1}
      paddingRight={1}
      height={3}
    >
      <text color="#888888" marginRight={1}>
        {isLoading ? "…" : ">"}
      </text>
      <input
        value={value}
        placeholder={placeholder}
        focused={focused}
        onInput={handleInput}
        onSubmit={handleSubmit}
        flexGrow={1}
        height={1}
      />
    </box>
  );
};

export default SearchBar;
