# Contributing to Bokeh

Thank you for your interest in contributing to Bokeh! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Git
- Basic knowledge of React, TypeScript, and Electron

### Development Setup
1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/bokeh.git`
3. Install dependencies: `npm install`
4. Start development: `npm run electron-dev`

## 📋 How to Contribute

### Reporting Bugs
- Use GitHub Issues with the "bug" label
- Include steps to reproduce
- Provide system information (OS, Node version, etc.)
- Attach screenshots or recordings if relevant

### Suggesting Features
- Use GitHub Issues with the "enhancement" label  
- Describe the use case and benefits
- Consider implementation complexity
- Check existing issues to avoid duplicates

### Code Contributions

#### Branch Naming
- `feature/description` - New features
- `fix/description` - Bug fixes  
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring

#### Commit Messages
Follow conventional commits:
- `feat: add smooth zoom animation system`
- `fix: resolve timeline scrubbing performance issue`
- `docs: update installation instructions`
- `refactor: optimize recording engine memory usage`

#### Pull Request Process
1. Create a feature branch from `main`
2. Make your changes following our coding standards
3. Add tests if applicable
4. Update documentation if needed
5. Submit a pull request with a clear description

## 🏗 Architecture Guidelines

### Component Structure
```tsx
// Component with proper TypeScript and prop interfaces
interface ComponentProps {
  // Always define props interface
}

export function Component({ }: ComponentProps) {
  // Use custom hooks for business logic
  // Keep components focused on UI rendering
  
  return (
    // JSX with proper accessibility
  )
}
```

### State Management
- Use Zustand stores for global state
- Keep stores focused on specific domains (recording, timeline, export)
- Use custom hooks to encapsulate store logic

### Styling
- Use Tailwind CSS classes
- Leverage CSS variables from globals.css
- Follow the design system patterns
- Ensure responsive design

## 🧪 Testing

### Running Tests
```bash
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

### Writing Tests
- Write unit tests for utility functions
- Add integration tests for complex workflows
- Test keyboard shortcuts and accessibility
- Include performance tests for timeline operations

## 📝 Code Style

### TypeScript
- Always use TypeScript
- Define proper interfaces for all props and data
- Avoid `any` types
- Use strict mode configurations

### React
- Use functional components with hooks
- Implement proper error boundaries
- Follow React best practices for performance
- Use proper dependency arrays in useEffect

### Performance
- Optimize for 60fps timeline scrubbing
- Use React.memo for expensive components
- Implement proper virtualization for large lists
- Profile and optimize animation performance

## 🎨 Design Guidelines

### UI/UX Principles
- **Information Dense**: Show relevant data without clutter
- **Keyboard-First**: Every action should have shortcuts
- **Contemporary**: Modern, minimal, functional design
- **Professional**: Meet the standards of professional video tools

### Component Design
- Use shadcn/ui as the base component library
- Follow the established design tokens
- Ensure consistent spacing and typography
- Implement proper loading and error states

## 🔍 Code Review

### What We Look For
- **Functionality**: Does it work as intended?
- **Performance**: Is it optimized for real-time usage?
- **Design**: Does it follow our design system?
- **Accessibility**: Can it be used with keyboard/screen readers?
- **Tests**: Are there appropriate tests?
- **Documentation**: Is it properly documented?

### Review Process
1. Automated checks (TypeScript, ESLint, tests)
2. Design review for UI changes
3. Performance review for timeline/recording features
4. Security review for file handling
5. Final approval and merge

## 📚 Documentation

### Code Documentation
- Document complex algorithms and business logic
- Add JSDoc comments for public APIs
- Include usage examples for components
- Update README.md for user-facing changes

### Architecture Decisions
- Document significant architectural decisions
- Include rationale and alternatives considered
- Update CLAUDE.md for developer guidance

## 🐛 Debugging

### Development Tools
- React Developer Tools
- Electron Developer Tools
- Timeline performance profiler
- Memory usage monitoring

### Common Issues
- **Performance**: Profile timeline scrubbing with large projects
- **Memory**: Monitor for memory leaks in long recordings
- **Cross-platform**: Test on multiple operating systems
- **File handling**: Verify proper file path handling

## 📈 Performance Standards

### Timeline Performance
- 60fps scrubbing with 1000+ clips
- Smooth zoom operations at all levels
- Responsive playback controls

### Recording Performance  
- No dropped frames during recording
- Efficient memory usage for long recordings
- Real-time encoding without system lag

### Export Performance
- Hardware-accelerated encoding when available
- Progress reporting without blocking UI
- Efficient file I/O operations

## 🎯 Priority Areas

We're particularly interested in contributions to:

1. **Animation Engine**: Advanced effects and transitions
2. **Export Pipeline**: Additional formats and optimizations
3. **Accessibility**: Keyboard navigation and screen reader support
4. **Performance**: Timeline optimization and memory usage
5. **Platform Support**: Windows and Linux compatibility
6. **Plugin System**: Extensibility architecture

## 🤔 Questions?

- 💬 Join our Discord for real-time discussion
- 📧 Email developers@bokeh.app
- 📖 Check our documentation at docs.bokeh.app
- 🐛 Search existing issues on GitHub

Thank you for contributing to Bokeh! 🎬