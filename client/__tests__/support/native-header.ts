import { screen, waitFor } from 'expo-router/testing-library';

type HeaderTitle = { title: string; titleColor?: string };

/**
 * The native stack top bar showing `title`, if any. Jest doesn't draw the native
 * top bar, so this reads the bar's config instead of its text.
 */
export function queryHeaderTitle(title: string): HeaderTitle | null {
  const header = screen.container.queryAll(
    (node) => node.type === 'RNSScreenStackHeaderConfig' && node.props.title === title,
  )[0];
  return header ? (header.props as HeaderTitle) : null;
}

/** Waits for a native stack top bar showing `title`. */
export async function findHeaderTitle(title: string): Promise<HeaderTitle> {
  return waitFor(() => {
    const header = queryHeaderTitle(title);
    expect(header).not.toBeNull();
    return header as HeaderTitle;
  });
}
