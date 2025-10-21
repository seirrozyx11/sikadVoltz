import mongoose from 'mongoose';

async function investigateDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sikadvoltz');
    console.log('Connected to MongoDB');

    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\nAvailable collections:');
    collections.forEach(collection => {
      console.log(`- ${collection.name} (type: ${collection.type})`);
    });

    // Check each collection for plans
    for (const collection of collections) {
      if (collection.name.toLowerCase().includes('plan') || 
          collection.name.toLowerCase().includes('goal') ||
          collection.name.toLowerCase().includes('cycling')) {
        const count = await mongoose.connection.db.collection(collection.name).countDocuments();
        console.log(`\n Collection "${collection.name}": ${count} documents`);
        
        if (count > 0) {
          const samples = await mongoose.connection.db.collection(collection.name).find({}).limit(2).toArray();
          console.log('Sample documents:');
          samples.forEach((doc, index) => {
            console.log(`Sample ${index + 1}:`, JSON.stringify(doc, null, 2));
          });
        }
      }
    }

  } catch (error) {
    console.error('Error investigating database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the investigation
investigateDatabase();