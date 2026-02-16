import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { MenuProvider } from "../components/_shared/menu-context";

export default function RootLayout() {
  return (
    <MenuProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </MenuProvider>
  );
}
