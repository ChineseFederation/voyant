import { RouterProvider } from "@tanstack/react-router"
import { StartClient } from "@tanstack/react-start/client"
import { StrictMode, startTransition } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { getRouter } from "./router.js"

startTransition(() => {
  if (document.documentElement.dataset.voyantPortableShell === "1") {
    createRoot(document).render(
      <StrictMode>
        <RouterProvider router={getRouter()} />
      </StrictMode>,
    )
  } else {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    )
  }
})
