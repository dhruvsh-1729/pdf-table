import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group font-semibold"
      style={
        {
          "--normal-bg": "black",
          "--normal-text": "white",
          "--normal-border": "var(--border)",
          "--font-weight": "600",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
