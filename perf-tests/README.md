# Performance Testing Framework

This directory contains comprehensive performance tests for the Flying Squid Minecraft server to analyze performance characteristics, identify bottlenecks, and ensure performance doesn't degrade over time.

## Overview

The performance testing framework is designed to:
- Test core server functions under various load conditions
- Compare performance with vanilla Minecraft servers
- Provide API-friendly testing for custom consumer setups
- Generate performance metrics and charts
- Test different module configurations

## Test Categories

### 1. Basic Movement Tests
- **Walking Simulation**: Multiple players walking on flat worlds
- **Jumping/Movement**: Complex movement patterns
- **Entity Movement**: Testing entity physics and movement

### 2. World Interaction Tests
- **Block Breaking**: Multiple players breaking blocks simultaneously
- **Block Placement**: Building structures with many players
- **Chunk Loading**: Testing chunk generation and loading performance

### 3. Load Tests
- **Player Scaling**: Testing with increasing numbers of players
- **Entity Scaling**: Testing with many entities
- **World Size**: Testing with different world sizes

### 4. Module Performance Tests
- **Module Disabling**: Testing performance impact of different modules
- **Configuration Variations**: Testing different server configurations

## Test Structure

```
perf-tests/
├── scenarios/           # Test scenario definitions
├── runners/            # Test execution engines
├── metrics/            # Performance measurement tools
├── reports/            # Generated performance reports
├── configs/            # Test configurations
└── utils/              # Shared testing utilities
```

## Quick Start

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Run basic movement test**:
   ```bash
   pnpm run perf:movement
   ```

3. **Run comprehensive test suite**:
   ```bash
   pnpm run perf:all
   ```

4. **Generate performance report**:
   ```bash
   pnpm run perf:report
   ```

## Test Scenarios

### Movement Test
- Spawns 10-100 mineflayer clients
- Simulates realistic player movement patterns
- Measures TPS (Ticks Per Second) and latency
- Generates performance charts

### Building Test
- Multiple players building simultaneously
- Tests block placement and removal performance
- Measures chunk update performance

### Load Test
- Gradually increases player count
- Tests server stability under load
- Identifies performance bottlenecks

## Configuration

Tests can be configured via `configs/` directory:
- Player counts
- Test durations
- World configurations
- Performance thresholds

## API Usage

The framework provides a clean API for custom performance testing:

```typescript
import { PerformanceTestRunner } from './runners/PerformanceTestRunner'
import { MovementScenario } from './scenarios/MovementScenario'

const runner = new PerformanceTestRunner()
const scenario = new MovementScenario({
  playerCount: 50,
  duration: 300, // 5 minutes
  worldType: 'flat'
})

const results = await runner.run(scenario)
console.log(`Average TPS: ${results.averageTPS}`)
```

## Metrics Collected

- **TPS (Ticks Per Second)**: Server performance indicator
- **Latency**: Player connection response times
- **Memory Usage**: Server memory consumption
- **CPU Usage**: Server CPU utilization
- **Chunk Loading**: World generation performance
- **Entity Updates**: Entity processing performance

## Reports

Performance reports are generated in multiple formats:
- HTML dashboards with interactive charts
- JSON data for programmatic analysis
- CSV exports for spreadsheet analysis
- Performance trend analysis over time

## Contributing

To add new test scenarios:
1. Create a new scenario class in `scenarios/`
2. Implement the `TestScenario` interface
3. Add configuration options in `configs/`
4. Update the test runner to include your scenario

## Troubleshooting

Common issues and solutions:
- **Port conflicts**: Change default ports in test configs
- **Memory issues**: Reduce player counts or test duration
- **Network issues**: Check firewall and network configuration