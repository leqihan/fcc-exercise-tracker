const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const assert = require('assert');
const cors = require('cors')

const mongoose = require('mongoose')
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true })

app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())


app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});


const Schema = mongoose.Schema;
const userSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true
  }
});
const User = mongoose.model('User', userSchema);


const activitySchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  description: String,
  duration: Number,
  timestamp: {
    type: String,
    validate: isValidDate
  }
});
const Activity = mongoose.model('Activity', activitySchema);

function isValidDate(dateString) {
  var regEx = /^\d{4}-\d{2}-\d{2}$/;
  if(!dateString.match(regEx)) return false;  // Invalid format
  var d = new Date(dateString);
  if(Number.isNaN(d.getTime())) return false; // Invalid date
  return d.toISOString().slice(0,10) === dateString;
}


app.post('/api/exercise/new-user', addNewUser);

function addNewUser(req, res) {
  let queryUser = User.findOne({username: req.body.username}).exec();
  queryUser.then(
    function fulfilled(doc) {
      if (doc) {
        return 'userExists';
      } else {
        let newUser = new User({username: req.body.username});
        return newUser.save();
      }
    }
  ).then(
    function fulfilled(doc) {
      if (doc === 'userExists') {
        res.send('username already taken');
      } else {
        res.json({username: doc.username, _id: doc._id});
      }
    }
  ).catch(
    function rejected(err) {
      res.send('err processing request');
      console.log(err);
    }
  );
}


app.post('/api/exercise/add', saveActivity);

function saveActivity(req, res) {
  let idValidate = User.findById(req.body.userId).exec();
  idValidate.then(
    function fulfilled(doc) {
      if (!doc) {
        return Promise.reject('unknown _id');
      } else {
        let newActivity = new Activity({
          user: doc._id,
          description: req.body.description,
          duration: req.body.duration,
          timestamp: req.body.date
        });
        return newActivity.save();
      }
    }
  ).then(
    function fulfilled(doc) {
      return Activity.findById(doc._id).populate('user').exec();
    }
  ).then(
    (doc) => {
      res.json({
        username: doc.user.username,
        description: doc.description,
        duration: doc.duration,
        _id: doc.user._id,
        date: doc.timestamp
      });
    }
  ).catch(
    (err) => res.send(err)
  );
}


app.get('/api/exercise/log', getLog);

function getLog(req, res) {
  if (!req.query.userId) {
    res.send('unknown userId');
    return;
  }
  let filter = {user: req.query.userId};
  
  let dateRange = {};
  if (req.query.from && isValidDate(req.query.from)) dateRange['$gte'] = req.query.from;
  if (req.query.to && isValidDate(req.query.to)) dateRange['$lte'] = req.query.to;
  if (!(Object.keys(dateRange).length === 0 && dateRange.constructor === Object)) filter.timestamp = dateRange;

  let logs = Activity.find(filter).populate('user');
  if (parseInt(req.query.limit) !== NaN) logs = logs.limit(parseInt(req.query.limit));
  
  logs.exec().then(
    (doc) => {
      res.json({
        _id: doc[0].user._id,
        username: doc[0].user.username,
        from: req.query.from || '',
        to: req.query.to || '',
        count: doc.length,
        log: doc.map(cleanUp)
      });
      
      function cleanUp(val) {
        console.log(val);
        return {description: val.description, duration: val.duration, date: val.timestamp};
      }
    }
  ).catch(
    err => {
      console.log(err);
      res.send(err);
    });
}

app.get('/populate', (req, res) => {
  Activity.find({}).populate('user').exec()
    .then(
      doc => res.json(doc)
    ).catch(err => res.send(err));
});


// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
