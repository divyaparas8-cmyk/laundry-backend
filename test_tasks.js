const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/laundry').then(async () => {
  const Order = require('./src/models/Order');
  const orders = await Order.find();
  const valid = orders.filter(o => o.workshopTasks && (o.workshopTasks.washedBy || o.workshopTasks.ironedBy || o.workshopTasks.stitchedBy));
  console.log('Orders with tasks:', valid.length);
  if (valid.length > 0) {
    console.log(valid[0].workshopTasks);
  }
  process.exit(0);
}).catch(console.error);
