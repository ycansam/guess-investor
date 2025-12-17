import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { startMLAutomation } from "../services/ml-automation-service";

export default function RootLayout() {
  // Iniciar automatización ML cuando la app carga
  useEffect(() => {
    startMLAutomation();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </>
  );
}
