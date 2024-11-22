class CircuitBreaker {
    constructor(maxFailures, timeout, instances) {
        this.maxFailures = maxFailures; // Number of failures before removing an instance
        this.timeout = timeout; // Maximum time to wait for each request
        this.instances = instances; // Service instances (e.g., URLs of the services)
        this.failures = new Array(instances.length).fill(0); // Track failures per instance
        this.currentInstanceIndex = 0; // Index of the current instance
    }

    // Method that tries to send the request to the current instance
    async callService(serviceCall) {
        try {
            // If no instances remain, throw an error
            if (this.instances.length === 0) {
                console.log(`All instances have failed.`);
                throw new Error('All instances have failed.');
            }

            const instance = this.instances[this.currentInstanceIndex];
            console.log(`Sending the request to: ${instance}`);

            // If the current instance is available, make the request
            const response = await serviceCall(instance);
            this.resetFailures(this.currentInstanceIndex); // Reset failure counter for the current instance
            return response;
        } catch (error) {
            this.failures[this.currentInstanceIndex]++; // Increment failure count for the current instance
            console.error(`Failed to send request to ${this.instances[this.currentInstanceIndex]}. Failures: ${this.failures[this.currentInstanceIndex]}`);

            // If the number of failures exceeds the threshold, remove the instance
            if (this.failures[this.currentInstanceIndex] >= this.maxFailures) {
                console.log(`Removing instance ${this.instances[this.currentInstanceIndex]} after ${this.maxFailures} failures.`);
                this.instances.splice(this.currentInstanceIndex, 1); // Remove the failed instance
                this.failures.splice(this.currentInstanceIndex, 1); // Remove the corresponding failure count

                // Ensure we do not go out of bounds after removal
                if (this.instances.length > 0) {
                    // Move to the next instance in the list
                    this.currentInstanceIndex = this.currentInstanceIndex % this.instances.length;
                } else {
                    // If no instances remain, reset the index to 0, which will be meaningless but indicate that all failed
                    this.currentInstanceIndex = 0;
                }
            }

            // If all instances are failed, throw an error
            if (this.instances.length === 0) {
                console.log('All instances have failed.');
                throw new Error('All instances have failed.');
            }

            throw new Error('Circuit breaker intervened');
        }
    }

    // Reset failure counter for a specific instance
    resetFailures(instanceIndex) {
        this.failures[instanceIndex] = 0;
    }
}

module.exports = CircuitBreaker;
