import React from 'react';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import SkillsView from '../SkillsView';

const mockUseHasAccess = jest.fn((..._args: unknown[]) => true);
const mockUseMediaQuery = jest.fn((_query: string) => false);
const mockUseGetAgentsConfig = jest.fn(() => ({ agentsConfig: { capabilities: ['skills'] } }));

jest.mock(
  'librechat-data-provider',
  () => ({
    PermissionTypes: { SKILLS: 'skills' },
    Permissions: { USE: 'use', CREATE: 'create' },
  }),
  { virtual: true },
);

jest.mock(
  '@librechat/client',
  () => ({
    Spinner: () => <div data-testid="spinner" />,
    useMediaQuery: (query: string) => mockUseMediaQuery(query),
  }),
  { virtual: true },
);

jest.mock('~/components/Chat/Menus/OpenSidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="open-sidebar" />,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useHasAccess: (...args: unknown[]) => mockUseHasAccess(...args),
  useAuthContext: () => ({
    user: { role: 'admin' },
    roles: { admin: {} },
  }),
  useGetAgentsConfig: () => mockUseGetAgentsConfig(),
}));

jest.mock('~/data-provider', () => ({
  useGetSkillByIdQuery: jest.fn(() => ({
    isLoading: false,
    isError: false,
    data: null,
  })),
}));

jest.mock('~/components/Skills/forms', () => ({
  CreateSkillForm: () => <div data-testid="create-skill-form" />,
  SkillForm: () => <div data-testid="skill-form" />,
}));

jest.mock('~/components/Skills/display/SkillFileViewer', () => () => (
  <div data-testid="skill-file-viewer" />
));
jest.mock('~/components/Skills/display/SkillDetail', () => () => (
  <div data-testid="skill-detail" />
));
jest.mock('~/components/Skills/display/SkillState', () => ({ title }: { title: string }) => (
  <div>{title}</div>
));

describe('SkillsView', () => {
  beforeEach(() => {
    mockUseHasAccess.mockReset();
    mockUseHasAccess.mockReturnValue(true);
    mockUseMediaQuery.mockReset();
    mockUseMediaQuery.mockReturnValue(false);
    mockUseGetAgentsConfig.mockReset();
    mockUseGetAgentsConfig.mockReturnValue({ agentsConfig: { capabilities: ['skills'] } });
  });

  it('redirects to a chat when Agents is disabled', async () => {
    mockUseGetAgentsConfig.mockReturnValue({ agentsConfig: null });
    const router = createMemoryRouter(
      [
        { path: '/skills', element: <SkillsView /> },
        { path: '/c/new', element: <div data-testid="chat-route" /> },
      ],
      { initialEntries: ['/skills'] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByTestId('chat-route')).toBeInTheDocument();
  });

  it('renders the create skill form for /skills/new', () => {
    const router = createMemoryRouter([{ path: '/skills/new', element: <SkillsView /> }], {
      initialEntries: ['/skills/new'],
    });

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId('create-skill-form')).toBeInTheDocument();
  });

  it('renders the sidebar toggle on small screens', () => {
    mockUseMediaQuery.mockReturnValue(true);
    const router = createMemoryRouter([{ path: '/skills', element: <SkillsView /> }], {
      initialEntries: ['/skills'],
    });

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId('open-sidebar')).toBeInTheDocument();
  });

  it('does not render the sidebar toggle on large screens', () => {
    const router = createMemoryRouter([{ path: '/skills', element: <SkillsView /> }], {
      initialEntries: ['/skills'],
    });

    render(<RouterProvider router={router} />);

    expect(screen.queryByTestId('open-sidebar')).not.toBeInTheDocument();
  });
});
