import { useRef, useState } from 'react';
import { IconStack2 } from '@tabler/icons-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Button } from '@/components/ui/button.jsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.jsx';
import { ProjectTree } from './ProjectTree.jsx';
import { WorkspaceSwitcher } from './WorkspaceSwitcher.jsx';

gsap.registerPlugin(useGSAP);

function ExtensionIcon(props) {
  return <IconStack2 {...props} />;
}

const sidebarSurfaceButtonBase =
  'app-no-drag flex h-8 w-full items-center justify-start gap-2 overflow-hidden p-2 text-left text-sm font-normal ring-sidebar-ring outline-hidden motion-colors-layout focus-visible:ring-2 motion-reduce:transition-none';

const sidebarIconButtonBase =
  'app-no-drag size-8 min-w-0 p-0 motion-colors focus-visible:ring-2 motion-reduce:transition-none';

const activeSurfaceButtonClass =
  'bg-accent-soft font-medium text-accent-soft-foreground hover:bg-accent-soft-hover hover:text-accent-soft-foreground active:bg-accent-soft-hover active:text-accent-soft-foreground data-pressed:bg-accent-soft-hover data-pressed:text-accent-soft-foreground';

const inactiveSurfaceButtonClass =
  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground data-pressed:bg-sidebar-accent data-pressed:text-sidebar-accent-foreground';

export function AppSidebar({
  activeSurfaceId,
  sidebarItems,
  footerSidebarItems,
  workspaces,
  currentWorkspace,
  selectedProjectId,
  selectedNoteId,
  isWorkspaceLoading,
  workspaceError,
  workspaceMenuOpen,
  createWorkspaceDialogOpen,
  onSelectSurface,
  onSelectProject,
  onSelectNote,
  onSelectWorkspace,
  onWorkspaceMenuOpenChange,
  onCreateWorkspaceDialogOpenChange,
  onCreateWorkspace,
  onResizeSidebar,
  isSidebarOpen,
  resizeMinWidth,
  resizeMaxWidth,
  resizeCollapseThreshold,
}) {
  const sidebarRef = useRef(null);
  const hasMountedRef = useRef(false);
  const isResizingRef = useRef(false);
  const hasAnimatedResizeRevealRef = useRef(false);
  const [isSidebarVisuallyOpen, setIsSidebarVisuallyOpen] = useState(isSidebarOpen);

  useGSAP(
    () => {
      const sidebar = sidebarRef.current;
      if (!sidebar) return;

      const targetWidth = isSidebarOpen ? 'var(--sidebar-width)' : '0px';

      if (!hasMountedRef.current) {
        hasMountedRef.current = true;
        gsap.set(sidebar, { width: targetWidth });
        return;
      }

      if (isResizingRef.current) {
        if (isSidebarOpen && !isSidebarVisuallyOpen) {
          setIsSidebarVisuallyOpen(true);
          return;
        }

        if (!isSidebarOpen && isSidebarVisuallyOpen) {
          hasAnimatedResizeRevealRef.current = false;
          gsap.set(sidebar, { width: '0px' });
          setIsSidebarVisuallyOpen(false);
          return;
        }

        gsap.set(sidebar, isSidebarOpen ? { clearProps: 'width' } : { width: '0px' });

        if (isSidebarOpen && !hasAnimatedResizeRevealRef.current) {
          hasAnimatedResizeRevealRef.current = true;
          const resizeContentElements = sidebar.querySelectorAll('[data-sidebar-content]');

          gsap.fromTo(
            resizeContentElements,
            { autoAlpha: 0, x: -8 },
            {
              autoAlpha: 1,
              x: 0,
              duration: 0.2,
              stagger: 0.04,
              ease: 'power2.out',
              overwrite: 'auto',
            },
          );
        }

        return;
      }

      if (isSidebarOpen && !isSidebarVisuallyOpen) {
        setIsSidebarVisuallyOpen(true);
        return;
      }

      if (!isSidebarOpen && !isSidebarVisuallyOpen) {
        gsap.set(sidebar, { width: targetWidth });
        return;
      }

      if (import.meta.env.MODE === 'test') {
        gsap.set(sidebar, { width: targetWidth });
        if (!isSidebarOpen) {
          setIsSidebarVisuallyOpen(false);
        }
        return;
      }

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) {
        gsap.set(sidebar, { width: targetWidth });
        if (!isSidebarOpen) {
          setIsSidebarVisuallyOpen(false);
        }
        return;
      }

      const contentElements = sidebar.querySelectorAll('[data-sidebar-content]');
      const currentWidth = `${sidebar.getBoundingClientRect().width}px`;

      if (isSidebarOpen) {
        const tl = gsap.timeline();

        tl.fromTo(
          sidebar,
          { width: currentWidth },
          {
            width: 'var(--sidebar-width)',
            duration: 0.3,
            ease: 'power2.out',
          },
          0,
        ).from(
          contentElements,
          {
            autoAlpha: 0,
            x: -10,
            duration: 0.2,
            stagger: 0.05,
            ease: 'power2.out',
          },
          '-=0.15',
        );
      } else {
        const tl = gsap.timeline({
          onComplete: () => setIsSidebarVisuallyOpen(false),
        });

        tl.to(contentElements, {
          autoAlpha: 0,
          x: -10,
          duration: 0.15,
          stagger: 0.03,
          ease: 'power2.in',
        }).fromTo(
          sidebar,
          { width: currentWidth },
          {
            width: '0px',
            duration: 0.25,
            ease: 'power2.in',
          },
          '-=0.09',
        );
      }
    },
    {
      dependencies: [isSidebarOpen, isSidebarVisuallyOpen],
      scope: sidebarRef,
      revertOnUpdate: true,
    },
  );

  function handleResizePointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    const sidebarWrapper = event.currentTarget.closest('[data-slot="sidebar-wrapper"]');

    if (!sidebarWrapper) {
      return;
    }

    let latestClientX = event.clientX;
    let isCollapsedDuringResize = !isSidebarOpen;

    isResizingRef.current = true;
    sidebarWrapper.classList.add('app-sidebar-resizing');

    function stopResize() {
      isResizingRef.current = false;
      sidebarWrapper.classList.remove('app-sidebar-resizing');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    }

    function handlePointerMove(moveEvent) {
      latestClientX = moveEvent.clientX;

      if (moveEvent.clientX < resizeCollapseThreshold) {
        if (!isCollapsedDuringResize) {
          isCollapsedDuringResize = true;
          onResizeSidebar(moveEvent.clientX);
        }

        return;
      }

      const nextSidebarWidth = Math.min(
        Math.max(moveEvent.clientX, resizeMinWidth),
        resizeMaxWidth,
      );

      sidebarWrapper.style.setProperty('--sidebar-width', `${nextSidebarWidth}px`);

      if (isCollapsedDuringResize) {
        isCollapsedDuringResize = false;
        onResizeSidebar(nextSidebarWidth);
      }
    }

    function handlePointerUp() {
      stopResize();

      onResizeSidebar(latestClientX);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  }

  return (
    <aside
      ref={sidebarRef}
      className={`relative hidden h-[calc(100dvh-3rem)] shrink-0 flex-col overflow-hidden border-r border-border text-sidebar-foreground md:flex ${isSidebarVisuallyOpen ? 'w-(--sidebar-width)' : 'w-0'}`}
      data-collapsible={isSidebarVisuallyOpen ? '' : 'hidden'}
      data-sidebar-state={isSidebarVisuallyOpen ? 'expanded' : 'collapsed'}
      data-slot="app-sidebar"
    >
      <div data-sidebar-content className="flex flex-col gap-2 p-2">
        <ul className="flex min-w-0 flex-col gap-0">
          <li className="relative">
            <WorkspaceSwitcher
              workspaces={workspaces}
              currentWorkspace={currentWorkspace}
              isLoading={isWorkspaceLoading}
              error={workspaceError}
              menuOpen={workspaceMenuOpen}
              isSidebarOpen={isSidebarVisuallyOpen}
              onMenuOpenChange={onWorkspaceMenuOpenChange}
              createDialogOpen={createWorkspaceDialogOpen}
              onCreateDialogOpenChange={onCreateWorkspaceDialogOpenChange}
              onSelectWorkspace={onSelectWorkspace}
              onCreateWorkspace={onCreateWorkspace}
            />
          </li>
        </ul>
      </div>

      <div
        data-sidebar-content
        className="no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto data-[collapsed=true]:overflow-hidden"
      >
        <section className="relative flex w-full min-w-0 flex-col p-2">
          <div
            className={`flex h-8 shrink-0 items-center px-2 text-xs font-medium text-sidebar-foreground/70 ${!isSidebarVisuallyOpen ? '-mt-8 opacity-0' : ''}`}
          >
            Workspace
          </div>

          <div className="w-full text-sm">
            <ul className="flex w-full min-w-0 flex-col gap-0">
              {sidebarItems.map((item) => {
                const surfaceId = item.href.replace(/^#/, '');
                const Icon = item.icon ?? ExtensionIcon;
                const isActive = surfaceId === activeSurfaceId;
                const surfaceButton = (
                  <Button
                    className={`${sidebarSurfaceButtonBase} justify-start ${isActive ? `font-medium ${activeSurfaceButtonClass}` : inactiveSurfaceButtonClass}`}
                    type="button"
                    variant="ghost"
                    onClick={() => onSelectSurface(surfaceId)}
                  >
                    <Icon aria-hidden="true" className="size-[18px] shrink-0 translate-y-px" />
                    <span className="truncate">{item.label}</span>
                  </Button>
                );

                return (
                  <li key={item.id} className="relative">
                    {surfaceButton}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <ProjectTree
          currentWorkspace={currentWorkspace}
          selectedProjectId={selectedProjectId}
          selectedNoteId={selectedNoteId}
          isSidebarOpen={isSidebarVisuallyOpen}
          onSelectProject={onSelectProject}
          onSelectNote={onSelectNote}
        />
      </div>

      {footerSidebarItems.length > 0 && (
        <div data-sidebar-content className="flex flex-col gap-2 p-2">
          <TooltipProvider delay={0}>
            <ul className="flex min-w-0 flex-col gap-0">
              {footerSidebarItems.map((item) => {
                const surfaceId = item.href.replace(/^#/, '');
                const Icon = item.icon ?? ExtensionIcon;
                const isActive = surfaceId === activeSurfaceId;
                const surfaceButton = (
                  <Button
                    aria-label={item.label}
                    className={`${sidebarIconButtonBase} ${isActive ? activeSurfaceButtonClass : inactiveSurfaceButtonClass}`}
                    size="icon-lg"
                    type="button"
                    variant="ghost"
                    onClick={() => onSelectSurface(surfaceId)}
                  >
                    <Icon
                      aria-hidden="true"
                      className="size-[18px] shrink-0 translate-y-px"
                      data-icon="inline-start"
                    />
                    <span className="sr-only">{item.label}</span>
                  </Button>
                );

                return (
                  <li key={item.id} className="relative">
                    <Tooltip>
                      <TooltipTrigger render={surfaceButton} />
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </TooltipProvider>
        </div>
      )}

      <div
        aria-label="Resize sidebar"
        className="app-no-drag absolute top-0 right-0 z-30 hidden h-full w-2 translate-x-1/2 cursor-col-resize bg-transparent hover:bg-border md:block"
        role="separator"
        tabIndex={0}
        onPointerDown={handleResizePointerDown}
      />
    </aside>
  );
}
