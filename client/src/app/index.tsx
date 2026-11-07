import { Redirect } from 'expo-router';

/** The app opens on the Workout tab. */
export default function Index() {
  return <Redirect href="/workout" />;
}
