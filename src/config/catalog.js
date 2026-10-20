const SERVICES = {
  go: {
    service_id: 'go',
    service_name: 'Yassir Go',
    service_deep_link: 'yassir://go',
    description: 'Ride-hailing.',
  },
  food: {
    service_id: 'food',
    service_name: 'Yassir Express',
    service_deep_link: 'yassir://express/food',
    description: 'Food delivery inside Yassir Express.',
  },
  grocery: {
    service_id: 'grocery',
    service_name: 'Yassir Express',
    service_deep_link: 'yassir://express/grocery',
    description: 'Grocery delivery inside Yassir Express.',
  },
  pay: {
    service_id: 'pay',
    service_name: 'Yassir Pay',
    service_deep_link: 'yassir://pay',
    description: 'Payments.',
  },
};

const SERVICE_IDS = Object.keys(SERVICES);

module.exports = { SERVICES, SERVICE_IDS };
