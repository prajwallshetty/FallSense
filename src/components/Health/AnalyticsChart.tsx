import React from 'react';
import { View, Text, Dimensions, StyleSheet } from 'react-native';
import Svg, { Rect, Path, Circle, Defs, LinearGradient, Stop, Line } from 'react-native-svg';

interface DataPoint {
  label: string; // e.g. Mon, Tue
  value: number; // e.g. steps
}

interface AnalyticsChartProps {
  data: DataPoint[];
  type: 'bar' | 'line';
  title: string;
  subtitle?: string;
  maxValue?: number;
}

export const AnalyticsChart: React.FC<AnalyticsChartProps> = ({
  data,
  type,
  title,
  subtitle,
  maxValue = 10000,
}) => {
  const screenWidth = Dimensions.get('window').width - 48; // padding adjusted
  const chartHeight = 180;
  const paddingBottom = 25;
  const paddingTop = 10;
  const paddingLeft = 45;
  const paddingRight = 10;

  const graphWidth = screenWidth - paddingLeft - paddingRight;
  const graphHeight = chartHeight - paddingTop - paddingBottom;

  // Render Bar Chart
  const renderBarChart = () => {
    const barWidth = (graphWidth / data.length) * 0.6;
    const spacing = (graphWidth / data.length) * 0.4;
    
    return data.map((item, idx) => {
      const heightPercentage = Math.min(1, item.value / maxValue);
      const barHeight = graphHeight * heightPercentage;
      const x = paddingLeft + idx * (barWidth + spacing) + spacing / 2;
      const y = chartHeight - paddingBottom - barHeight;

      return (
        <React.Fragment key={idx}>
          {/* Background trace bar */}
          <Rect
            x={x}
            y={paddingTop}
            width={barWidth}
            height={graphHeight}
            fill="#E2E8F0"
            opacity={0.15}
            rx={4}
          />
          {/* Active colored bar */}
          <Rect
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill="url(#chartGrad)"
            rx={4}
          />
          {/* Label under x-axis */}
          <Text
            style={[styles.axisLabel, {
              position: 'absolute',
              left: x + (barWidth - 40) / 2,
              top: chartHeight - 20,
              width: 40,
            }]}
          >
            {item.label}
          </Text>
        </React.Fragment>
      );
    });
  };

  // Render Line Chart
  const renderLineChart = () => {
    const points = data.map((item, idx) => {
      const x = paddingLeft + (idx * (graphWidth / (data.length - 1)));
      const heightPercentage = Math.min(1, item.value / maxValue);
      const y = chartHeight - paddingBottom - (graphHeight * heightPercentage);
      return { x, y, value: item.value, label: item.label };
    });

    let pathD = '';
    let areaD = '';

    points.forEach((pt, idx) => {
      if (idx === 0) {
        pathD = `M ${pt.x} ${pt.y}`;
        areaD = `M ${pt.x} ${chartHeight - paddingBottom} L ${pt.x} ${pt.y}`;
      } else {
        // Curve construction using bezier points
        const prev = points[idx - 1];
        const cpX1 = prev.x + (pt.x - prev.x) / 2;
        const cpY1 = prev.y;
        const cpX2 = prev.x + (pt.x - prev.x) / 2;
        const cpY2 = pt.y;

        pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${pt.x} ${pt.y}`;
        areaD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${pt.x} ${pt.y}`;
      }
      
      if (idx === points.length - 1) {
        areaD += ` L ${pt.x} ${chartHeight - paddingBottom} Z`;
      }
    });

    return (
      <>
        {/* Shaded Area under the path */}
        <Path d={areaD} fill="url(#areaGrad)" opacity={0.3} />
        {/* Line path */}
        <Path d={pathD} fill="transparent" stroke="url(#chartGrad)" strokeWidth={3} />
        
        {/* Data points (Circles) */}
        {points.map((pt, idx) => (
          <React.Fragment key={idx}>
            <Circle cx={pt.x} cy={pt.y} r={4} fill="#0D9488" stroke="#FFFFFF" strokeWidth={1.5} />
            <Text
              style={[styles.axisLabel, {
                position: 'absolute',
                left: pt.x - 20,
                top: chartHeight - 20,
                width: 40,
              }]}
            >
              {pt.label}
            </Text>
          </React.Fragment>
        ))}
      </>
    );
  };

  // Helper grid y-axis labels
  const yTicks = [0, 0.5, 1];

  return (
    <View style={styles.cardContainer}>
      {/* Title */}
      <View style={styles.titleContainer}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitle}>{subtitle}</Text>
        ) : null}
      </View>

      <View style={{ height: chartHeight, width: screenWidth }}>
        <Svg width={screenWidth} height={chartHeight}>
          <Defs>
            <LinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#0D9488" />
              <Stop offset="100%" stopColor="#2DD4BF" />
            </LinearGradient>
            
            <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#0D9488" />
              <Stop offset="100%" stopColor="#2DD4BF" stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {/* Grid Lines & Y Labels */}
          {yTicks.map((tick, idx) => {
            const y = paddingTop + graphHeight * (1 - tick);
            return (
              <React.Fragment key={idx}>
                <Line
                  x1={paddingLeft}
                  y1={y}
                  x2={screenWidth - paddingRight}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeOpacity={0.2}
                  strokeDasharray="4 4"
                />
                {/* Y-axis Labels */}
                <Line
                  x1={paddingLeft}
                  y1={paddingTop}
                  x2={paddingLeft}
                  y2={chartHeight - paddingBottom}
                  stroke="#E2E8F0"
                  strokeOpacity={0.3}
                />
              </React.Fragment>
            );
          })}
        </Svg>

        {/* Text overlays for y-axis values */}
        {yTicks.map((tick, idx) => {
          const y = paddingTop + graphHeight * (1 - tick);
          const valLabel = Math.round(tick * maxValue);
          return (
            <Text
              key={idx}
              style={[styles.axisLabel, {
                position: 'absolute',
                left: 0,
                top: y - 7,
                width: paddingLeft - 8,
                textAlign: 'right',
              }]}
            >
              {valLabel >= 1000 ? `${(valLabel / 1000).toFixed(1)}k` : valLabel}
            </Text>
          );
        })}

        {/* Draw Graphs */}
        {type === 'bar' ? renderBarChart() : renderLineChart()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: 'rgba(30,41,59,0.4)',
    borderColor: 'rgba(51,65,85,0.3)',
    borderWidth: 1,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  titleContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
  },
  axisLabel: {
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
});
