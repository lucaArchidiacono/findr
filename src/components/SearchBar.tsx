interface SearchBarProps {
  value: string;
  placeholder?: string;
  isLoading: boolean;
  focused: boolean;
  onChange(value: string): void;
  onSubmit(): void;
}

export const SearchBar = ({
  value,
  placeholder = "Search the web or type :command",
  isLoading,
  focused,
  onChange,
  onSubmit,
}: SearchBarProps) => {
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
      borderStyle="rounded"
      borderColor="#555555"
      paddingLeft={1}
      paddingRight={1}
      height={3}
    >
      <text marginRight={1}>{isLoading ? "…" : ">"}</text>
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
