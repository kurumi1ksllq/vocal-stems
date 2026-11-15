import { createBrowserRouter, RouterProvider } from 'react-router'
import { Layout } from '@/components/layout'
import { AboutPage } from '@/pages/about'
import { LibraryPage } from '@/pages/library'
import { NotFoundPage } from '@/pages/not-found'
import { StudioPage } from '@/pages/studio'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <StudioPage /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
