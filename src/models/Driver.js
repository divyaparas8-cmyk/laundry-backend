const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  driverNo: {
    type: String,
    required: true,
    unique: true
  },
  driverName: {
    type: String,
    required: true
  },
  mobile: {
    type: String,
    default: ''
  },
  tel: {
    type: String
  },
  areas: [{
    type: String
  }],
  street: {
    type: String
  },
  part: {
    type: String
  },
  jadda: {
    type: String
  },
  houseNo: {
    type: String
  },
  floor: {
    type: String
  },
  flat: {
    type: String
  },
  addressNotes: {
    type: String
  },
  carNo: {
    type: String,
    default: ''
  },
  civilId: {
    type: String,
    default: ''
  },
  nationality: {
    type: String,
    default: ''
  },
  branch: {
    type: String,
    default: 'Main'
  },
  status: {
    type: String,
    enum: ['Available', 'Off Duty', 'On Delivery', 'Assigned'],
    default: 'Available'
  }
}, { timestamps: true });

module.exports = mongoose.model('Driver', driverSchema);
