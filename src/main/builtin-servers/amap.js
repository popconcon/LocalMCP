const { MCPServer } = require('@modelcontextprotocol/sdk');

const amapServer = new MCPServer({
  name: 'amap',
  displayName: '高德地图',
  description: '高德地图服务，提供地图、导航、地理编码等功能',
  version: '1.0.0',
  baseUrl: 'https://mcp.so/server/amap-maps/amap',
  tools: [
    'maps_regeocode',
    'maps_geo',
    'maps_ip_location',
    'maps_weather',
    'maps_search_detail',
    'maps_bicycling',
    'maps_direction_walking',
    'maps_direction_driving',
    'maps_transit',
    'maps_distance',
    'maps_poi_search',
    'maps_around_search'
  ],
  authentication: {
    type: 'apiKey',
    required: true,
    description: '需要高德地图 API Key'
  }
});

module.exports = amapServer; 